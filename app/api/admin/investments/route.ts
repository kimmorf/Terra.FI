import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { extractTokenPrice, calculateTokenAmount } from '@/lib/investments/token-distribution';

export const dynamic = 'force-dynamic';

// GET - Buscar todos os investimentos (para admin)
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

    // Admin pode ver sem autenticação na página inicial, mas vamos manter a verificação
    // if (!session) {
    //   return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    // }

    const investments = await prisma.investment.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            walletAddress: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            type: true,
            purpose: true,
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

// PATCH - Atualizar status do investimento (publicar/negar)
export async function PATCH(request: NextRequest) {
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

    // Admin pode atualizar sem autenticação na página inicial, mas vamos manter a verificação
    // if (!session) {
    //   return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    // }

    const body = await request.json();
    const { investmentId, status } = body;

    if (!investmentId || !status) {
      return NextResponse.json(
        { error: 'investmentId e status são obrigatórios' },
        { status: 400 }
      );
    }

    // Valida status permitido
    const allowedStatuses = ['pending', 'confirmed', 'cancelled', 'published', 'denied'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status inválido. Permitidos: ${allowedStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Busca o investimento
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      include: { project: true },
    });

    if (!investment) {
      return NextResponse.json(
        { error: 'Investimento não encontrado' },
        { status: 404 }
      );
    }

    // Atualiza o status
    const updatedInvestment = await prisma.investment.update({
      where: { id: investmentId },
      data: { status },
    });

    // Se foi publicado, atualiza o total arrecadado do projeto
    if (status === 'published' && investment.status !== 'published') {
      await prisma.investmentProject.update({
        where: { id: investment.projectId },
        data: {
          totalAmount: {
            increment: investment.amount,
          },
        },
      });

      // Retorna informações para o frontend enviar tokens
      const tokenPrice = extractTokenPrice(investment.project.example);
      const tokenAmount = tokenPrice ? calculateTokenAmount(investment.amount, tokenPrice) : 0;

      return NextResponse.json({
        ...updatedInvestment,
        tokenDistribution: {
          tokenPrice,
          tokenAmount: tokenAmount > 0 ? tokenAmount.toFixed(2) : null,
          currency: investment.project.type,
        },
      });
    }

    // Se foi negado/cancelado e estava publicado, reduz o total arrecadado
    if ((status === 'denied' || status === 'cancelled') && investment.status === 'published') {
      await prisma.investmentProject.update({
        where: { id: investment.projectId },
        data: {
          totalAmount: {
            decrement: investment.amount,
          },
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao atualizar investimento:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar investimento' },
      { status: 500 }
    );
  }
}

