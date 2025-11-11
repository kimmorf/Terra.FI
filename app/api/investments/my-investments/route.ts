import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';

// GET - Buscar investimentos do usuário logado
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await auth.api.getSession({
      headers: request.headers,
      cookies: cookieStore,
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

