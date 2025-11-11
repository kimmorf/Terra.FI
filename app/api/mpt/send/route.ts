import { NextRequest, NextResponse } from 'next/server';
import { sendMPT } from '@/lib/xrpl/mpt-helpers';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';

/**
 * API Route para enviar MPT
 * 
 * POST /api/mpt/send
 * 
 * Body:
 * {
 *   fromAddress: string,
 *   fromSeed: string,
 *   toAddress: string,
 *   mptokenIssuanceID: string,
 *   amount: string,
 *   memo?: string,
 *   network?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fromAddress: rawFromAddress,
      fromSeed: rawFromSeed,
      toAddress,
      mptokenIssuanceID,
      amount,
      memo,
      walletId,
      network: rawNetwork = 'testnet'
    } = body;

    let fromAddress = rawFromAddress;
    let fromSeed = rawFromSeed;
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

      fromAddress = wallet.address;
      fromSeed = decryptSecret(wallet.seedEncrypted);
      network = (wallet.network as 'testnet' | 'mainnet' | 'devnet') || network;
    }

    // Validações básicas
    if (!fromAddress || typeof fromAddress !== 'string') {
      return NextResponse.json(
        { error: 'fromAddress é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!fromSeed || typeof fromSeed !== 'string') {
      return NextResponse.json(
        { error: 'fromSeed é obrigatório para enviar MPT' },
        { status: 400 }
      );
    }

    if (!toAddress || typeof toAddress !== 'string') {
      return NextResponse.json(
        { error: 'toAddress é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!mptokenIssuanceID || typeof mptokenIssuanceID !== 'string') {
      return NextResponse.json(
        { error: 'mptokenIssuanceID é obrigatório' },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== 'string') {
      return NextResponse.json(
        { error: 'amount é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!fromAddress.startsWith('r') || fromAddress.length < 25) {
      return NextResponse.json(
        { error: 'fromAddress inválido (deve começar com "r")' },
        { status: 400 }
      );
    }

    if (!toAddress.startsWith('r') || toAddress.length < 25) {
      return NextResponse.json(
        { error: 'toAddress inválido (deve começar com "r")' },
        { status: 400 }
      );
    }

    // Enviar MPT
    const txHash = await sendMPT({
      fromAddress,
      fromSeed,
      toAddress,
      mptokenIssuanceID,
      amount,
      memo,
      network
    });

    return NextResponse.json({
      success: true,
      txHash,
      from: fromAddress,
      to: toAddress,
      amount
    });
  } catch (error: any) {
    console.error('[API MPT Send] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao enviar MPT',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
