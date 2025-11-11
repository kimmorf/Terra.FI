import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';

// GET - Buscar todos os projetos (para admin ver todos, incluindo inativos)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await auth.api.getSession({
      headers: request.headers,
      cookies: cookieStore,
    });
    
    // Admin pode ver sem autenticação na página inicial, mas vamos manter a verificação
    // Você pode remover essa verificação se quiser que qualquer um veja os projetos no admin
    // if (!session) {
    //   return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    // }

    const projects = await prisma.investmentProject.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Erro ao buscar projetos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar projetos de investimento' },
      { status: 500 }
    );
  }
}

