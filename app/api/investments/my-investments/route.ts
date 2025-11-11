import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET - Buscar investimentos do usuário logado
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Banco de dados indisponível.' },
        { status: 503 },
      );
    }

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const investments = await prisma.investment.findMany({
      where: {
        userId: session.user.id,
        status: 'confirmed',
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            type: true,
            purpose: true,
            example: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(investments);
  } catch (error) {
    console.error('Erro ao buscar investimentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar investimentos' },
      { status: 500 }
    );
  }
}

