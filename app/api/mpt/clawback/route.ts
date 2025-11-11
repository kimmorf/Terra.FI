import { NextRequest, NextResponse } from 'next/server';
import { clawbackMPT } from '@/lib/xrpl/mpt-helpers';

/**
 * POST /api/mpt/clawback
 * {
 *   issuerAddress: string;
 *   issuerSeed: string;
 *   currency: string;
 *   holderAddress: string;
 *   amount: string;
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
      amount,
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

    if (!amount || typeof amount !== 'string') {
      return NextResponse.json(
        { error: 'amount é obrigatório e deve ser uma string' },
        { status: 400 },
      );
    }

    const txHash = await clawbackMPT({
      issuerAddress,
      issuerSeed,
      currency,
      holderAddress,
      amount,
      network,
    });

    return NextResponse.json({
      success: true,
      txHash,
    });
  } catch (error: any) {
    console.error('[API MPT Clawback] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao executar clawback de MPT',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}


