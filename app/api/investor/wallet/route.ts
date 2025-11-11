import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function GET() {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Configure o banco para usar carteiras.' },
        { status: 503 },
      );
    }

    const wallet = await prisma.serviceWallet.findFirst({
      where: { type: 'user', isActive: true },
    });

    if (!wallet) {
      return NextResponse.json({ wallet: null });
    }

    const { seedEncrypted, ...sanitized } = wallet;
    return NextResponse.json({ wallet: sanitized });
  } catch (error) {
    console.error('[InvestorWallet][GET] Erro ao obter carteira ativa:', error);
    return NextResponse.json(
      { error: 'Erro ao obter carteira ativa' },
      { status: 500 },
    );
  }
}


