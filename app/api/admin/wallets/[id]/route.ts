import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Configure o banco para remover carteiras.' },
        { status: 503 },
      );
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'ID da carteira não informado' }, { status: 400 });
    }

    await prisma.serviceWallet.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[ServiceWallet][DELETE] Erro ao remover carteira:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Carteira não encontrada' }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message || 'Erro ao remover carteira de serviço' },
      { status: 500 },
    );
  }
}


