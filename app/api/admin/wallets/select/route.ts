import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Configure o banco para selecionar carteiras.' },
        { status: 503 },
      );
    }

    const { walletId } = await request.json();
    if (!walletId || typeof walletId !== 'string') {
      return NextResponse.json(
        { error: 'walletId é obrigatório e deve ser uma string' },
        { status: 400 },
      );
    }

    const wallet = await prisma.serviceWallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
      return NextResponse.json({ error: 'Carteira não encontrada' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.serviceWallet.updateMany({
        where: {
          type: wallet.type,
        },
        data: {
          isActive: false,
        },
      }),
      prisma.serviceWallet.update({
        where: { id: walletId },
        data: { isActive: true },
      }),
    ]);

    const updated = await prisma.serviceWallet.findUnique({ where: { id: walletId } });
    if (!updated) {
      return NextResponse.json({ error: 'Carteira não encontrada após atualização' }, { status: 404 });
    }

    const { seedEncrypted, ...sanitized } = updated;
    return NextResponse.json(sanitized);
  } catch (error: any) {
    console.error('[ServiceWallet][SELECT] Erro ao ativar carteira:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao ativar carteira' },
      { status: 500 },
    );
  }
}


