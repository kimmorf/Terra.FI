import { NextRequest, NextResponse } from 'next/server';
import { getXRPBalance, getAccountMPTokens } from '@/lib/xrpl/account';
import { getIssuedMPTokens, getAccountLines } from '@/lib/xrpl/mpt';
import { isValidXRPLAddress } from '@/lib/xrpl/validation';
import type { XRPLNetwork } from '@/lib/xrpl/pool';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/balance
 * 
 * Retorna saldo XRP, tokens e MPTs emitidos de uma carteira
 * 
 * Query params:
 * - address: endereço XRPL (obrigatório)
 * - network: testnet | devnet | mainnet (padrão: testnet)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');
    const network = (searchParams.get('network') as XRPLNetwork) || 'testnet';

    if (!address) {
      return NextResponse.json(
        { error: 'Parâmetro "address" é obrigatório' },
        { status: 400 }
      );
    }

    if (!isValidXRPLAddress(address)) {
      return NextResponse.json(
        { error: 'Endereço XRPL inválido' },
        { status: 400 }
      );
    }

    // Buscar dados em paralelo
    const [xrpBalance, accountLines, issuedMPTs] = await Promise.all([
      getXRPBalance(address, network).catch((err) => {
        console.warn('[API Wallet Balance] Erro ao buscar XRP balance:', err.message);
        return null;
      }),
      getAccountLines({ account: address, network }).catch((err) => {
        console.warn('[API Wallet Balance] Erro ao buscar account lines:', err.message);
        return [];
      }),
      getIssuedMPTokens({ issuer: address, network }).catch((err) => {
        console.warn('[API Wallet Balance] Erro ao buscar issued MPTs:', err.message);
        return [];
      }),
    ]);

    // Formatar tokens das account_lines
    const tokens = (accountLines || []).map((line: any) => ({
      currency: line.currency,
      balance: line.balance,
      issuer: line.account,
      limit: line.limit,
    }));

    // Formatar MPTs emitidos
    const mptArray = Array.isArray(issuedMPTs) ? issuedMPTs : [];
    const formattedMPTs = mptArray.map((mpt: any) => ({
      issuanceIdHex: mpt.MPTokenIssuanceID || mpt.issuanceIdHex,
      ticker: mpt.Currency || mpt.ticker,
      currency: mpt.Currency || mpt.currency,
      assetScale: mpt.AssetScale ?? mpt.assetScale ?? 0,
      maximumAmount: mpt.MaximumAmount || mpt.maximumAmount,
      metadata: mpt.MPTokenMetadata ? tryParseMetadata(mpt.MPTokenMetadata) : null,
    }));

    return NextResponse.json({
      address,
      network,
      xrpBalance,
      tokens,
      issuedMPTs: formattedMPTs,
      tokenCount: tokens.length,
      issuedMPTCount: formattedMPTs.length,
    });
  } catch (error: any) {
    console.error('[API Wallet Balance] Erro:', error);
    
    // Tratar erro de conta não encontrada
    if (error.message?.includes('actNotFound') || error.message?.includes('Account not found')) {
      return NextResponse.json({
        address: null,
        network: 'testnet',
        xrpBalance: 0,
        tokens: [],
        issuedMPTs: [],
        tokenCount: 0,
        issuedMPTCount: 0,
        error: 'Conta não encontrada na rede. A conta pode não ter sido fundada.',
      });
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao buscar dados da carteira' },
      { status: 500 }
    );
  }
}

function tryParseMetadata(hexData: string): Record<string, any> | null {
  try {
    const decoded = Buffer.from(hexData, 'hex').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

