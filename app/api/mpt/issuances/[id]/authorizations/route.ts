import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

/**
 * GET /api/mpt/issuances/:id/authorizations
 * 
 * Lista todas as autorizações de uma emissão MPT
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada' },
        { status: 503 }
      );
    }

    const { id } = params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // PENDING | AUTHORIZED | REJECTED
    const walletAddress = searchParams.get('walletAddress');

    // Verificar se a emissão existe
    const issuance = await prisma.mPTIssuance.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!issuance) {
      return NextResponse.json(
        { error: 'Emissão MPT não encontrada' },
        { status: 404 }
      );
    }

    const where: any = {
      issuanceId: id,
    };

    if (status) {
      where.status = status;
    }

    if (walletAddress) {
      where.walletAddress = walletAddress;
    }

    const authorizations = await prisma.mPTAuthorization.findMany({
      where,
      include: {
        wallet: {
          select: {
            id: true,
            label: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      authorizations: authorizations.map((auth) => ({
        id: auth.id,
        walletAddress: auth.walletAddress,
        walletType: auth.walletType,
        wallet: auth.wallet,
        status: auth.status,
        authorizationTxHash: auth.authorizationTxHash,
        authorizationRequestId: auth.authorizationRequestId,
        createdAt: auth.createdAt,
        updatedAt: auth.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('[API MPT Authorizations GET] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao listar autorizações',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

