import { NextRequest, NextResponse } from 'next/server';
import { Wallet, xrpToDrops } from 'xrpl';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { xrplPool, type XRPLNetwork } from '@/lib/xrpl/pool';
import { ReliableSubmission } from '@/lib/xrpl/reliable-submission';
import { trySendFaucet } from '@/lib/xrpl/mpt-helpers';

/**
 * API Route para enviar pagamentos (XRP, IOU ou MPT)
 * 
 * POST /api/xrpl/payment
 * 
 * Body:
 * {
 *   walletId?: string,        // ID da carteira de serviço (alternativa a account/seed)
 *   account?: string,         // Endereço da conta remetente
 *   seed?: string,            // Seed da conta remetente
 *   destination: string,      // Endereço de destino
 *   amount: string,           // Quantidade
 *   
 *   // Para XRP nativo:
 *   isXRP?: boolean,          // true = pagamento em XRP
 *   
 *   // Para MPT (Multi-Purpose Token):
 *   mptokenIssuanceID?: string, // ID do MPT (64 chars hex)
 *   
 *   // Para IOU legado:
 *   currency?: string,        // Código da moeda (3-20 chars)
 *   issuer?: string,          // Endereço do emissor
 *   
 *   network?: string,         // testnet, devnet, mainnet
 *   memo?: string             // Memo opcional
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      walletId,
      account: rawAccount,
      seed: rawSeed,
      destination,
      amount,
      currency,
      issuer,
      mptokenIssuanceID,
      isXRP = false,
      network: rawNetwork = 'testnet',
      memo,
    } = body;

    const prisma = getPrismaClient();

    let account = rawAccount as string | undefined;
    let seed = rawSeed as string | undefined;
    let network = rawNetwork as XRPLNetwork;

    if (walletId) {
      if (!prisma) {
        return NextResponse.json(
          { error: 'DATABASE_URL não configurada. Configure o banco para enviar pagamentos.' },
          { status: 503 },
        );
      }
      const wallet = await prisma.serviceWallet.findUnique({ where: { id: walletId } });
      if (!wallet) {
        return NextResponse.json({ error: 'Carteira não encontrada' }, { status: 404 });
      }
      account = wallet.address;
      seed = decryptSecret(wallet.seedEncrypted);
      network = wallet.network as XRPLNetwork;
    }

    if (!account || typeof account !== 'string') {
      return NextResponse.json({ error: 'account é obrigatório' }, { status: 400 });
    }

    if (!destination || typeof destination !== 'string') {
      return NextResponse.json({ error: 'destination é obrigatório' }, { status: 400 });
    }

    if (!amount || typeof amount !== 'string') {
      return NextResponse.json({ error: 'amount é obrigatório' }, { status: 400 });
    }

    if (!seed || typeof seed !== 'string') {
      return NextResponse.json({ error: 'seed é obrigatório' }, { status: 400 });
    }

    if (!destination.startsWith('r') || destination.length < 25) {
      return NextResponse.json({ error: 'destination inválido' }, { status: 400 });
    }

    if (!account.startsWith('r') || account.length < 25) {
      return NextResponse.json({ error: 'account inválido' }, { status: 400 });
    }

    const wallet = Wallet.fromSeed(seed);
    if (wallet.classicAddress !== account && wallet.address !== account) {
      return NextResponse.json({ error: 'Seed não corresponde à conta informada' }, { status: 400 });
    }

    // Tentar enviar faucet para o destino antes do pagamento
    // Isso garante que a conta destino exista e tenha fundos
    // Se falhar, ignoramos silenciosamente e continuamos
    if (network === 'testnet' || network === 'devnet') {
      console.log('[API Payment] Tentando enviar faucet para destino antes do pagamento...');
      await trySendFaucet(destination, network);
    }

    const client = await xrplPool.getClient(network);

    const tx: Record<string, unknown> = {
      TransactionType: 'Payment',
      Account: account,
      Destination: destination,
    };

    // Determinar tipo de pagamento: XRP > MPT > IOU
    if (isXRP) {
      // Pagamento em XRP nativo
      tx.Amount = xrpToDrops(amount);
    } else if (mptokenIssuanceID) {
      // Pagamento em MPT (Multi-Purpose Token)
      const cleanedID = mptokenIssuanceID.replace(/[^0-9A-Fa-f]/g, '');
      if (cleanedID.length !== 64) {
        return NextResponse.json(
          { error: `mptokenIssuanceID inválido. Esperado 64 caracteres hex, recebido: ${cleanedID.length}` },
          { status: 400 },
        );
      }
      tx.Amount = {
        mpt_issuance_id: cleanedID.toUpperCase(),
        value: amount,
      };
    } else {
      // Pagamento em IOU (legado)
      if (!currency || !issuer) {
        return NextResponse.json(
          { error: 'currency e issuer são obrigatórios para pagamentos IOU (ou use mptokenIssuanceID para MPTs)' },
          { status: 400 },
        );
      }
      tx.Amount = {
        currency: (currency as string).toUpperCase(),
        issuer,
        value: amount,
      };
    }

    // Adicionar memo se fornecido
    if (memo && typeof memo === 'string' && memo.trim()) {
      const memoHex = Buffer.from(memo.trim(), 'utf-8').toString('hex').toUpperCase();
      tx.Memos = [
        {
          Memo: {
            MemoData: memoHex,
          },
        },
      ];
    }

    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const rs = new ReliableSubmission(network);
    const result = await rs.submitAndWait(signed.tx_blob);

    const engineResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;
    if (engineResult && !engineResult.startsWith('tes')) {
      return NextResponse.json(
        { error: `Transação falhou: ${engineResult}`, engineResult },
        { status: 400 },
      );
    }

    const txHash = result.result.tx_json?.hash || (result.result as any).hash;

    return NextResponse.json({ success: true, txHash, result: result.result });
  } catch (error: any) {
    console.error('[API Payment] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao enviar pagamento' },
      { status: 500 },
    );
  }
}



