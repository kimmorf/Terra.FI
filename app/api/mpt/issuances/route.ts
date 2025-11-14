import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { createMPT } from '@/lib/xrpl/mpt-helpers';
import { CreateIssuanceSchema } from '@/lib/mpt/dto/create-issuance.dto';
import { createDistributionWallet } from '@/lib/mpt/distribution-wallet.service';
import { z } from 'zod';

/**
 * POST /api/mpt/issuances
 * 
 * Cria uma nova emissão MPT (LAND/BUILD/REV/COL) com issuer e distribution wallet
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const validated = CreateIssuanceSchema.parse(body);

    // 1. Validar issuer wallet
    const issuerWallet = await prisma.serviceWallet.findUnique({
      where: { id: validated.issuerWalletId },
    });

    if (!issuerWallet) {
      return NextResponse.json(
        { error: 'Carteira issuer não encontrada' },
        { status: 404 }
      );
    }

    if (issuerWallet.type !== 'ISSUER') {
      return NextResponse.json(
        { error: 'Carteira deve ser do tipo ISSUER' },
        { status: 400 }
      );
    }

    // 2. Gerenciar distribution wallet
    let distributionWalletId = validated.distributionWalletId;
    
    if (!distributionWalletId && validated.createDistributionWalletIfMissing) {
      // Criar nova carteira de distribuição
      const label = `Distribution Wallet - ${validated.symbol}`;
      const distWallet = await createDistributionWallet({
        label,
        network: validated.network,
      });
      distributionWalletId = distWallet.id;
    } else if (distributionWalletId) {
      // Validar que a carteira existe e é do tipo DISTRIBUTION
      const distWallet = await prisma.serviceWallet.findUnique({
        where: { id: distributionWalletId },
      });
      
      if (!distWallet) {
        return NextResponse.json(
          { error: 'Carteira de distribuição não encontrada' },
          { status: 404 }
        );
      }
      
      if (distWallet.type !== 'DISTRIBUTION') {
        return NextResponse.json(
          { error: 'Carteira deve ser do tipo DISTRIBUTION' },
          { status: 400 }
        );
      }
    }

    // 3. Preparar metadata
    const tokenType = validated.type.toLowerCase() as 'land' | 'build' | 'rev' | 'col';
    const metadata = validated.metadata || {};

    // 4. Preparar flags
    const flags: any = {};
    if (validated.flags.requireAuth) flags.requireAuth = true;
    if (validated.flags.canFreeze) flags.canLock = true; // canFreeze = canLock no XRPL
    if (validated.flags.canClawback) flags.canClawback = true;
    if (validated.flags.canTransfer) flags.canTransfer = true;
    if (validated.flags.canTrade) flags.canTrade = true;
    if (validated.flags.canEscrow) flags.canEscrow = true;

    // 5. Obter seed do issuer
    const issuerSeed = decryptSecret(issuerWallet.seedEncrypted);

    // 6. Criar MPT on-chain
    const result = await createMPT({
      issuerAddress: issuerWallet.address,
      issuerSeed,
      assetScale: validated.assetScale,
      maximumAmount: validated.maximumAmount,
      transferFee: validated.transferFee,
      metadata,
      tokenType,
      flags,
      network: validated.network,
    });

    // 7. Salvar no banco
    const issuance = await prisma.mPTIssuance.create({
      data: {
        type: validated.type,
        symbol: validated.symbol,
        name: validated.name,
        maximumAmount: validated.maximumAmount,
        decimals: validated.decimals,
        assetScale: validated.assetScale,
        transferFee: validated.transferFee,
        issuerWalletId: validated.issuerWalletId,
        distributionWalletId: distributionWalletId || null,
        xrplIssuanceId: result.mptokenIssuanceID,
        xrplCurrency: result.currency || null,
        issuanceTxHash: result.txHash,
        metadataJson: metadata,
        flags: flags,
        network: validated.network,
        status: 'CREATED',
      },
      include: {
        issuerWallet: {
          select: {
            id: true,
            address: true,
            label: true,
          },
        },
        distributionWallet: {
          select: {
            id: true,
            address: true,
            label: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      issuance: {
        id: issuance.id,
        type: issuance.type,
        symbol: issuance.symbol,
        name: issuance.name,
        xrplIssuanceId: issuance.xrplIssuanceId,
        xrplCurrency: issuance.xrplCurrency,
        issuanceTxHash: issuance.issuanceTxHash,
        issuerWallet: issuance.issuerWallet,
        distributionWallet: issuance.distributionWallet,
        status: issuance.status,
        network: issuance.network,
        createdAt: issuance.createdAt,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('[API MPT Issuances] Erro:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || 'Erro ao criar emissão MPT',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mpt/issuances
 * 
 * Lista todas as emissões de MPT com filtros opcionais
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // LAND | BUILD | REV | COL
    const symbol = searchParams.get('symbol');
    const status = searchParams.get('status');
    const network = searchParams.get('network');

    const where: any = {};
    if (type) where.type = type;
    if (symbol) where.symbol = { contains: symbol, mode: 'insensitive' };
    if (status) where.status = status;
    if (network) where.network = network;

    const issuances = await prisma.mPTIssuance.findMany({
      where,
      include: {
        issuerWallet: {
          select: {
            id: true,
            address: true,
            label: true,
          },
        },
        distributionWallet: {
          select: {
            id: true,
            address: true,
            label: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      issuances: issuances.map((issuance) => ({
        id: issuance.id,
        type: issuance.type,
        symbol: issuance.symbol,
        name: issuance.name,
        maximumAmount: issuance.maximumAmount,
        decimals: issuance.decimals,
        xrplIssuanceId: issuance.xrplIssuanceId,
        xrplCurrency: issuance.xrplCurrency,
        issuerWallet: issuance.issuerWallet,
        distributionWallet: issuance.distributionWallet,
        status: issuance.status,
        network: issuance.network,
        totalMinted: issuance.totalMinted,
        distributionBalance: issuance.distributionBalance,
        createdAt: issuance.createdAt,
        updatedAt: issuance.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('[API MPT Issuances GET] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao listar emissões',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

