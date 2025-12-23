import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mpt/issuances
 * Lista todas as emissões de MPT do banco de dados
 * 
 * Query params:
 * - network: filtrar por rede (testnet, mainnet, devnet)
 * - type: filtrar por tipo (LAND, BUILD, REV, COL)
 * - status: filtrar por status (CREATED, MINTED, ACTIVE, PAUSED)
 * - walletId: filtrar por carteira emissora
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'Banco de dados não disponível' },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const network = searchParams.get('network');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const walletId = searchParams.get('walletId');

    const where: any = {};
    if (network) where.network = network;
    if (type) where.type = type;
    if (status) where.status = status;
    if (walletId) where.issuerWalletId = walletId;

    const issuances = await prisma.mPTIssuance.findMany({
      where,
      include: {
        issuerWallet: {
          select: {
            id: true,
            label: true,
            address: true,
            network: true,
          },
        },
        distributionWallet: {
          select: {
            id: true,
            label: true,
            address: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Formatar resposta com URLs do explorer
    const formattedIssuances = issuances.map((issuance) => {
      const explorerBaseUrl = {
        mainnet: 'https://livenet.xrpl.org',
        testnet: 'https://testnet.xrpl.org',
        devnet: 'https://devnet.xrpl.org',
      }[issuance.network] || 'https://testnet.xrpl.org';

      return {
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
        network: issuance.network,
        status: issuance.status,
        totalMinted: issuance.totalMinted,
        distributionBalance: issuance.distributionBalance,
        metadataJson: issuance.metadataJson,
        flags: issuance.flags,
        createdAt: issuance.createdAt,
        updatedAt: issuance.updatedAt,
        issuerWallet: issuance.issuerWallet,
        distributionWallet: issuance.distributionWallet,
        // URLs do explorer
        // Nota: O XRPL Explorer ainda não tem página dedicada para MPTs
        // Usamos a conta emissora ou a transação de emissão
        explorerUrls: {
          mpt: issuance.issuerWallet?.address 
            ? `${explorerBaseUrl}/accounts/${issuance.issuerWallet.address}` 
            : null,
          tx: issuance.issuanceTxHash 
            ? `${explorerBaseUrl}/transactions/${issuance.issuanceTxHash}` 
            : null,
          issuer: issuance.issuerWallet?.address 
            ? `${explorerBaseUrl}/accounts/${issuance.issuerWallet.address}` 
            : null,
        },
      };
    });

    return NextResponse.json({
      issuances: formattedIssuances,
      total: formattedIssuances.length,
    });
  } catch (error: any) {
    console.error('[API MPT Issuances] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao listar emissões' },
      { status: 500 },
    );
  }
}
