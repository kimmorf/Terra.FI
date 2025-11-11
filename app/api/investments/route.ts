import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET - Buscar todos os projetos de investimento disponíveis (público)
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Banco de dados indisponível.' },
        { status: 503 },
      );
    }

    // Não requer autenticação - qualquer um pode ver os projetos disponíveis
    const projects = await prisma.investmentProject.findMany({
      where: {
        status: 'published',
      },
      include: {
        _count: {
          select: { investments: true },
        },
      },
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

// POST - Criar um novo investimento
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Banco de dados indisponível.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { projectId, amount, walletAddress, txHash, xrpAmount } = body;

    // Autenticação: aceita sessão do Better Auth OU wallet address do Crossmark
    let user = null;
    
    // Tenta obter sessão do Better Auth primeiro
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user) {
      user = session.user;
    } else if (walletAddress) {
      // Se não tem sessão, busca usuário pelo wallet address
      user = await prisma.user.findUnique({
        where: { walletAddress },
      });

      // Se não existe, cria o usuário
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: `Wallet ${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`,
            walletAddress,
            email: null,
          },
        });
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado. Conecte sua carteira.' }, { status: 401 });
    }

    if (!projectId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      );
    }

    // Verificar se o projeto existe e está ativo
    const project = await prisma.investmentProject.findUnique({
      where: { id: projectId },
    });

    if (!project || project.status !== 'published') {
      return NextResponse.json(
        { error: 'Projeto não encontrado ou não está publicado' },
        { status: 404 }
      );
    }

    // Verificar limites
    if (amount < project.minAmount) {
      return NextResponse.json(
        { error: `Valor mínimo é ${project.minAmount}` },
        { status: 400 }
      );
    }

    if (project.maxAmount && amount > project.maxAmount) {
      return NextResponse.json(
        { error: `Valor máximo é ${project.maxAmount}` },
        { status: 400 }
      );
    }

    // Criar investimento
    const investment = await prisma.investment.create({
      data: {
        userId: user.id,
        projectId,
        amount,
        xrpAmount: xrpAmount || null,
        txHash: txHash || null,
        status: 'confirmed', // Confirmado porque o pagamento XRP já foi enviado
      },
    });

    // Atualizar total arrecadado do projeto
    await prisma.investmentProject.update({
      where: { id: projectId },
      data: {
        totalAmount: {
          increment: amount,
        },
      },
    });

    return NextResponse.json(investment, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar investimento:', error);
    return NextResponse.json(
      { error: 'Erro ao criar investimento' },
      { status: 500 }
    );
  }
}

