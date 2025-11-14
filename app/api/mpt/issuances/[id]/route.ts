import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

/**
 * GET /api/mpt/issuances/:id
 * 
 * Obtém detalhes de uma emissão MPT específica
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

    const issuance = await prisma.mPTIssuance.findUnique({
      where: { id },
      include: {
        issuerWallet: {
          select: {
            id: true,
            address: true,
            label: true,
            type: true,
          },
        },
        distributionWallet: {
          select: {
            id: true,
            address: true,
            label: true,
            type: true,
          },
        },
        authorizations: {
          select: {
            id: true,
            walletAddress: true,
            walletType: true,
            status: true,
            authorizationTxHash: true,
            createdAt: true,
          },
        },
      },
    });

    if (!issuance) {
      return NextResponse.json(
        { error: 'Emissão MPT não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      issuance: {
        id: issuance.id,
        type: issuance.type,
        symbol: issuance.symbol,
        name: issuance.name,
        maximumAmount: issuance.maximumAmount,
        decimals: issuance.decimals,
        assetScale: issuance.assetScale,
        transferFee: issuance.transferFee,
        xrplIssuanceId: issuance.xrplIssuanceId,
        xrplCurrency: issuance.xrplCurrency,
        issuanceTxHash: issuance.issuanceTxHash,
        metadataJson: issuance.metadataJson,
        flags: issuance.flags,
        issuerWallet: issuance.issuerWallet,
        distributionWallet: issuance.distributionWallet,
        status: issuance.status,
        network: issuance.network,
        totalMinted: issuance.totalMinted,
        distributionBalance: issuance.distributionBalance,
        authorizations: issuance.authorizations,
        createdAt: issuance.createdAt,
        updatedAt: issuance.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[API MPT Issuance GET] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao obter emissão',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

