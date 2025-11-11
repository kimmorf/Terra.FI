import { NextRequest, NextResponse } from 'next/server';
import { getIssuedMPTokens } from '@/lib/xrpl/mpt';
import { isValidXRPLAddress } from '@/lib/xrpl/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const issuer = searchParams.get('issuer');
    const network = (searchParams.get('network') as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

    if (!issuer) {
      return NextResponse.json(
        { error: 'Parâmetro "issuer" é obrigatório' },
        { status: 400 }
      );
    }

    if (!isValidXRPLAddress(issuer)) {
      return NextResponse.json(
        { error: 'Endereço XRPL inválido' },
        { status: 400 }
      );
    }

    const mptokens = await getIssuedMPTokens({
      issuer,
      network,
    });

    // Garantir que é um array
    const tokensArray = Array.isArray(mptokens) ? mptokens : [];

    return NextResponse.json({
      issuer,
      network,
      count: tokensArray.length,
      tokens: tokensArray,
    });
  } catch (error: any) {
    console.error('[MPT List] Erro:', error);

    return NextResponse.json(
      { error: error.message || 'Erro ao listar MPTs emitidos' },
      { status: 500 }
    );
  }
}
