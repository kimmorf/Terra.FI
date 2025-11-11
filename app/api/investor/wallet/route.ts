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

    // Busca qualquer carteira ativa (issuer, user, ou admin)
    // Prioriza user, depois issuer, depois admin
    const wallet = await prisma.serviceWallet.findFirst({
      where: { isActive: true },
      orderBy: [
        // Prioriza type: user
        { type: 'asc' }, // 'admin' < 'issuer' < 'user' alfabeticamente, então invertemos a lógica abaixo
      ],
    });

    // Se encontrou, mas queremos priorizar 'user' > 'issuer' > 'admin'
    // Vamos buscar de forma mais explícita
    const userWallet = await prisma.serviceWallet.findFirst({
      where: { type: 'user', isActive: true },
    });

    const issuerWallet = await prisma.serviceWallet.findFirst({
      where: { type: 'issuer', isActive: true },
    });

    const adminWallet = await prisma.serviceWallet.findFirst({
      where: { type: 'admin', isActive: true },
    });

    // Prioridade: user > issuer > admin
    const selectedWallet = userWallet || issuerWallet || adminWallet;

    if (!selectedWallet) {
      return NextResponse.json({ wallet: null });
    }

    const { seedEncrypted, ...sanitized } = selectedWallet;
    return NextResponse.json({ wallet: sanitized });
  } catch (error) {
    console.error('[InvestorWallet][GET] Erro ao obter carteira ativa:', error);
    return NextResponse.json(
      { error: 'Erro ao obter carteira ativa' },
      { status: 500 },
    );
  }
}


