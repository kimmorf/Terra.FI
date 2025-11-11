import { NextRequest, NextResponse } from 'next/server';
import { getMPTInfo, getMPTBalance, isHolderAuthorized } from '@/lib/xrpl/mpt-helpers';

/**
 * API Route para buscar informações de MPT
 * 
 * GET /api/mpt/info?mptokenIssuanceID=xxx&network=testnet
 * GET /api/mpt/info?mptokenIssuanceID=xxx&holderAddress=yyy&network=testnet
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mptokenIssuanceID = searchParams.get('mptokenIssuanceID');
    const holderAddress = searchParams.get('holderAddress');
    const network = (searchParams.get('network') || 'testnet') as 'testnet' | 'mainnet' | 'devnet';

    if (!mptokenIssuanceID) {
      return NextResponse.json(
        { error: 'mptokenIssuanceID é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar informações do MPT
    const mptInfo = await getMPTInfo(mptokenIssuanceID, network);

    // Se holder fornecido, buscar saldo e autorização
    let holderInfo = null;
    if (holderAddress && holderAddress.startsWith('r')) {
      const [balance, authorized] = await Promise.all([
        getMPTBalance(holderAddress, mptokenIssuanceID, network),
        isHolderAuthorized(holderAddress, mptokenIssuanceID, network)
      ]);

      holderInfo = {
        address: holderAddress,
        balance,
        authorized
      };
    }

    return NextResponse.json({
      success: true,
      mptInfo,
      holderInfo
    });
  } catch (error: any) {
    console.error('[API MPT Info] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao buscar informações do MPT',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

