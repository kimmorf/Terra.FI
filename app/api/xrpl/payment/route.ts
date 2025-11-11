import { NextRequest, NextResponse } from 'next/server';
import { Wallet, xrpToDrops } from 'xrpl';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { xrplPool, type XRPLNetwork } from '@/lib/xrpl/pool';
import { ReliableSubmission } from '@/lib/xrpl/reliable-submission';

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
      isXRP = false,
      network: rawNetwork = 'testnet',
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

    const client = await xrplPool.getClient(network);

    const tx: Record<string, unknown> = {
      TransactionType: 'Payment',
      Account: account,
      Destination: destination,
    };

    if (isXRP) {
      tx.Amount = xrpToDrops(amount);
    } else {
      if (!currency || !issuer) {
        return NextResponse.json(
          { error: 'currency e issuer são obrigatórios para pagamentos IOU' },
          { status: 400 },
        );
      }
      tx.Amount = {
        currency: (currency as string).toUpperCase(),
        issuer,
        value: amount,
      };
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



