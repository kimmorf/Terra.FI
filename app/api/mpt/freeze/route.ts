import { NextRequest, NextResponse } from 'next/server';
import { freezeMPT } from '@/lib/xrpl/mpt-helpers';

/**
 * POST /api/mpt/freeze
 * {
 *   issuerAddress: string;
 *   issuerSeed: string;
 *   currency: string;
 *   holderAddress: string;
 *   freeze?: boolean;
 *   network?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      issuerAddress,
      issuerSeed,
      currency,
      holderAddress,
      freeze = true,
      network = 'testnet',
    } = body;

    if (!issuerAddress || typeof issuerAddress !== 'string') {
      return NextResponse.json(
        { error: 'issuerAddress é obrigatório e deve ser uma string' },
        { status: 400 },
      );
    }

    if (!issuerSeed || typeof issuerSeed !== 'string') {
      return NextResponse.json(
        { error: 'issuerSeed é obrigatório' },
        { status: 400 },
      );
    }

    if (!currency || typeof currency !== 'string') {
      return NextResponse.json(
        { error: 'currency é obrigatório e deve ser uma string' },
        { status: 400 },
      );
    }

    if (!holderAddress || typeof holderAddress !== 'string') {
      return NextResponse.json(
        { error: 'holderAddress é obrigatório e deve ser uma string' },
        { status: 400 },
      );
    }

    const txHash = await freezeMPT({
      issuerAddress,
      issuerSeed,
      currency,
      holderAddress,
      freeze,
      network,
    });

    return NextResponse.json({
      success: true,
      txHash,
      freeze,
    });
  } catch (error: any) {
    console.error('[API MPT Freeze] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao executar freeze de MPT',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}


