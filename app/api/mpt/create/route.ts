import { NextRequest, NextResponse } from 'next/server';
import { createMPT } from '@/lib/xrpl/mpt-helpers';

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
      issuerAddress,
      issuerSeed,
      assetScale = 0,
      maximumAmount = '0',
      transferFee = 0,
      metadata,
      metadataOverrides,
      tokenType,
      flags,
      network = 'testnet'
    } = body;

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

