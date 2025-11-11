import { NextRequest, NextResponse } from 'next/server';
import { Wallet } from 'xrpl';
import { xrplPool, type XRPLNetwork } from '@/lib/xrpl/pool';
import { ReliableSubmission } from '@/lib/xrpl/reliable-submission';

/**
 * API Route para criar trustline usando XRPL diretamente
 * 
 * Esta rota é uma alternativa quando a Crossmark não suporta TrustSet.
 * 
 * ATENÇÃO: Requer a seed/chave privada da carteira.
 * Use apenas em ambientes seguros e nunca exponha a seed no frontend.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, currency, issuer, limit = '1000000000', network = 'testnet', seed } = body;

    // Validações
    if (!account || typeof account !== 'string') {
      return NextResponse.json(
        { error: 'Account é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!currency || typeof currency !== 'string') {
      return NextResponse.json(
        { error: 'Currency é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!issuer || typeof issuer !== 'string') {
      return NextResponse.json(
        { error: 'Issuer é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!seed || typeof seed !== 'string') {
      return NextResponse.json(
        { error: 'Seed é obrigatório para criar trustline via API. Use outra carteira (xumm.app, xrptoolkit.com) se não quiser expor sua seed.' },
        { status: 400 }
      );
    }

    // Validar formato dos endereços
    if (!account.startsWith('r') || account.length < 25) {
      return NextResponse.json(
        { error: 'Account deve ser um endereço XRPL válido (começa com "r")' },
        { status: 400 }
      );
    }

    if (!issuer.startsWith('r') || issuer.length < 25) {
      return NextResponse.json(
        { error: 'Issuer deve ser um endereço XRPL válido (começa com "r")' },
        { status: 400 }
      );
    }

    // Validar que a conta da seed corresponde ao account fornecido
    let wallet: Wallet;
    try {
      wallet = Wallet.fromSeed(seed);
      if (wallet.classicAddress !== account && wallet.address !== account) {
        return NextResponse.json(
          { error: 'A seed fornecida não corresponde à conta especificada' },
          { status: 400 }
        );
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: `Seed inválida: ${error.message}` },
        { status: 400 }
      );
    }

    // Validar network
    const validNetworks: XRPLNetwork[] = ['testnet', 'mainnet', 'devnet'];
    if (!validNetworks.includes(network as XRPLNetwork)) {
      return NextResponse.json(
        { error: `Network inválido. Use: ${validNetworks.join(', ')}` },
        { status: 400 }
      );
    }

    // Criar transação TrustSet
    const client = await xrplPool.getClient(network as XRPLNetwork);

    const trustSet = {
      TransactionType: 'TrustSet',
      Account: account,
      LimitAmount: {
        currency: currency.toUpperCase(),
        issuer,
        value: limit,
      },
    };

    // Autofill
    const prepared = await client.autofill(trustSet);

    // Assinar
    const signed = wallet.sign(prepared);

    // Submeter e aguardar validação
    const rs = new ReliableSubmission(network as XRPLNetwork);
    const result = await rs.submitAndWait(signed.tx_blob);

    // Verificar resultado
    const transactionResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;
    if (transactionResult && !transactionResult.startsWith('tes')) {
      return NextResponse.json(
        { 
          error: `Transação falhou: ${transactionResult}`,
          engineResult: transactionResult,
        },
        { status: 400 }
      );
    }

    const txHash = result.result.tx_json?.hash || (result.result as any).hash;

    return NextResponse.json({
      success: true,
      txHash,
      result: result.result,
    });
  } catch (error: any) {
    console.error('[API Trustline] Erro:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Erro ao criar trustline',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

