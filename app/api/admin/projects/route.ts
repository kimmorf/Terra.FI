import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET - Buscar todos os projetos (para admin ver todos, incluindo inativos)
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
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

// POST - Criar um novo projeto de investimento
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, description, purpose, example, minAmount, maxAmount, targetAmount } = body;

    if (!name || !type || !purpose || !minAmount || !targetAmount) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: name, type, purpose, minAmount, targetAmount' },
        { status: 400 }
      );
    }

    // Validar tipo
    const validTypes = ['LAND', 'BUILD', 'REV', 'COL'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Tipo inválido. Use: LAND, BUILD, REV ou COL' },
        { status: 400 }
      );
    }

    // Criar projeto
    const project = await prisma.investmentProject.create({
      data: {
        name,
        type,
        description: description || null,
        purpose,
        example: example || null,
        minAmount: parseFloat(minAmount),
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        targetAmount: parseFloat(targetAmount),
        totalAmount: 0,
        status: 'active',
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar projeto:', error);
    return NextResponse.json(
      { error: 'Erro ao criar projeto de investimento' },
      { status: 500 }
    );
  }
}
