import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { extractTokenPrice, calculateTokenAmount } from '@/lib/investments/token-distribution';

export const dynamic = 'force-dynamic';

// POST - Enviar tokens MPT para o investidor após publicação
// Esta função será chamada pelo frontend quando o admin publicar um investimento
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
    const { investmentId, issuerAddress, network } = body;

    if (!investmentId || !issuerAddress) {
      return NextResponse.json(
        { error: 'investmentId e issuerAddress são obrigatórios' },
        { status: 400 }
      );
    }

    // Busca o investimento com projeto e usuário
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      include: {
        project: true,
        user: {
          select: {
            walletAddress: true,
          },
        },
      },
    });

    if (!investment) {
      return NextResponse.json(
        { error: 'Investimento não encontrado' },
        { status: 404 }
      );
    }

    if (!investment.user?.walletAddress) {
      return NextResponse.json(
        { error: 'Investidor não possui wallet address' },
        { status: 400 }
      );
    }

    // Extrai o preço do token do campo example
    const tokenPrice = extractTokenPrice(investment.project.example);
    if (!tokenPrice) {
      return NextResponse.json(
        { error: 'Não foi possível extrair o preço do token do campo example' },
        { status: 400 }
      );
    }

    // Calcula quantos tokens enviar
    const tokenAmount = calculateTokenAmount(investment.amount, tokenPrice);
    if (tokenAmount <= 0) {
      return NextResponse.json(
        { error: 'Quantidade de tokens inválida' },
        { status: 400 }
      );
    }

    // Retorna os dados para o frontend enviar os tokens via Crossmark
    return NextResponse.json({
      success: true,
      investmentId: investment.id,
      recipientAddress: investment.user.walletAddress,
      issuerAddress,
      currency: investment.project.type,
      tokenAmount: tokenAmount.toFixed(2),
      tokenPrice,
      investmentAmount: investment.amount,
      network: network || 'testnet',
    });
  } catch (error) {
    console.error('Erro ao preparar envio de tokens:', error);
    return NextResponse.json(
      { error: 'Erro ao preparar envio de tokens' },
      { status: 500 }
    );
  }
}

