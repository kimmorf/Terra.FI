import { NextRequest, NextResponse } from 'next/server';
import { authorizeMPTHolder } from '@/lib/xrpl/mpt-helpers';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';

/**
 * API Route para autorizar holder a receber MPT
 * 
 * POST /api/mpt/authorize
 * 
 * Body:
 * {
 *   holderAddress: string,
 *   holderSeed: string,
 *   mptokenIssuanceID: string,
 *   authorize?: boolean,
 *   network?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      holderAddress: rawHolder,
      holderSeed: rawSeed,
      mptokenIssuanceID,
      authorize = true,
      network: rawNetwork = 'testnet',
      walletId,
    } = body;

    const prisma = getPrismaClient();

    let holderAddress = rawHolder as string | undefined;
    let holderSeed = rawSeed as string | undefined;
    let network = rawNetwork as string;

    if (walletId) {
      if (!prisma) {
        return NextResponse.json(
          { error: 'DATABASE_URL não configurada. Configure o banco para usar carteiras.' },
          { status: 503 },
        );
      }
      const wallet = await prisma.serviceWallet.findUnique({ where: { id: walletId } });
      if (!wallet) {
        return NextResponse.json({ error: 'Carteira não encontrada' }, { status: 404 });
      }
      holderAddress = wallet.address;
      holderSeed = decryptSecret(wallet.seedEncrypted);
      network = wallet.network;
    }

    if (!holderAddress || typeof holderAddress !== 'string') {
      return NextResponse.json(
        { error: 'holderAddress é obrigatório e deve ser uma string' },
        { status: 400 },
      );
    }

    if (!holderSeed || typeof holderSeed !== 'string') {
      return NextResponse.json(
        { error: 'holderSeed é obrigatório para autorizar MPT' },
        { status: 400 },
      );
    }

    if (!mptokenIssuanceID || typeof mptokenIssuanceID !== 'string') {
      return NextResponse.json(
        { error: 'mptokenIssuanceID é obrigatório' },
        { status: 400 },
      );
    }

    if (!holderAddress.startsWith('r') || holderAddress.length < 25) {
      return NextResponse.json(
        { error: 'holderAddress inválido (deve começar com "r")' },
        { status: 400 },
      );
    }

    const txHash = await authorizeMPTHolder({
      holderAddress,
      holderSeed,
      mptokenIssuanceID,
      authorize,
      network,
    });

    return NextResponse.json({
      success: true,
      txHash,
      authorized: authorize,
    });
  } catch (error: any) {
    console.error('[API MPT Authorize] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao autorizar holder',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
