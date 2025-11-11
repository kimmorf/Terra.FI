import { NextRequest, NextResponse } from 'next/server';
import { clawbackMPT } from '@/lib/xrpl/mpt-helpers';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';

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
      issuerAddress: rawIssuerAddress,
      issuerSeed: rawIssuerSeed,
      currency,
      holderAddress,
      amount,
      walletId,
      network: rawNetwork = 'testnet',
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


