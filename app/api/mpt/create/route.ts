import { NextRequest, NextResponse } from 'next/server';
import { createMPT } from '@/lib/xrpl/mpt-helpers';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';

/**
 * API Route para criar um MPT (Multi-Purpose Token)
 * 
 * POST /api/mpt/create
 * 
 * Body:
 * {
 *   issuerAddress: string,
 *   issuerSeed: string,
 *   assetScale?: number,
 *   maximumAmount?: string,
 *   transferFee?: number,
 *   metadata?: object,
 *   flags?: object,
 *   network?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      issuerAddress: rawIssuerAddress,
      issuerSeed: rawIssuerSeed,
      assetScale = 0,
      maximumAmount = '0',
      transferFee = 0,
      metadata,
      metadataOverrides,
      tokenType,
      flags,
      walletId,
      network: rawNetwork = 'testnet'
    } = body;

    let issuerAddress = rawIssuerAddress;
    let issuerSeed = rawIssuerSeed;
    let network = rawNetwork as 'testnet' | 'mainnet' | 'devnet';

    if (walletId) {
      const prisma = getPrismaClient();
      if (!prisma) {
        return NextResponse.json(
          { error: 'DATABASE_URL não configurada. Configure o banco para usar carteiras de serviço.' },
          { status: 503 },
        );
      }

      const wallet = await prisma.serviceWallet.findUnique({
        where: { id: walletId },
      });

      if (!wallet) {
        return NextResponse.json(
          { error: 'Carteira de serviço não encontrada' },
          { status: 404 },
        );
      }

      issuerAddress = wallet.address;
      issuerSeed = decryptSecret(wallet.seedEncrypted);
      network = (wallet.network as 'testnet' | 'mainnet' | 'devnet') || network;
    }

    // Validações básicas
    if (!issuerAddress || typeof issuerAddress !== 'string') {
      return NextResponse.json(
        { error: 'issuerAddress é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!issuerSeed || typeof issuerSeed !== 'string') {
      return NextResponse.json(
        { error: 'issuerSeed é obrigatório para criar MPT' },
        { status: 400 }
      );
    }

    if (!issuerAddress.startsWith('r') || issuerAddress.length < 25) {
      return NextResponse.json(
        { error: 'issuerAddress inválido (deve começar com "r")' },
        { status: 400 }
      );
    }

    if (tokenType && !['land', 'build', 'rev', 'col'].includes(tokenType)) {
      return NextResponse.json(
        { error: 'tokenType inválido. Use: land, build, rev ou col.' },
        { status: 400 }
      );
    }

    // Criar MPT
    const result = await createMPT({
      issuerAddress,
      issuerSeed,
      assetScale,
      maximumAmount,
      transferFee,
      metadata,
      metadataOverrides,
      tokenType,
      flags,
      network
    });

    return NextResponse.json({
      success: true,
      mptokenIssuanceID: result.mptokenIssuanceID,
      txHash: result.txHash,
      currency: result.currency,
      ticker: result.ticker,
      metadata: result.metadata,
      tokenType: result.tokenType,
      result: result.result
    });
  } catch (error: any) {
    console.error('[API MPT Create] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao criar MPT',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

