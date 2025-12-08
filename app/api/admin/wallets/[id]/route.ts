import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

// Fundar uma carteira existente
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada.' },
        { status: 503 },
      );
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'ID da carteira não informado' }, { status: 400 });
    }

    // Buscar carteira
    const wallet = await prisma.serviceWallet.findUnique({
      where: { id },
    });

    if (!wallet) {
      return NextResponse.json({ error: 'Carteira não encontrada' }, { status: 404 });
    }

    // Só pode fundar em testnet ou devnet
    if (wallet.network === 'mainnet') {
      return NextResponse.json(
        { error: 'Não é possível fundar carteiras na mainnet via faucet' },
        { status: 400 },
      );
    }

    // Fundar via faucet
    const faucetUrls: Record<string, string> = {
      testnet: 'https://faucet.altnet.rippletest.net/accounts',
      devnet: 'https://faucet.devnet.rippletest.net/accounts',
    };

    const faucetUrl = faucetUrls[wallet.network];
    console.log(`[ServiceWallet][FUND] Fundando carteira na ${wallet.network}:`, wallet.address);

    const response = await fetch(faucetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: wallet.address,
        xrpAmount: '1000',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ServiceWallet][FUND] Faucet ${wallet.network} retornou ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `Falha ao fundar: ${response.status} - ${errorText}` },
        { status: 502 },
      );
    }

    const faucetResponse = await response.json();
    console.log(`[ServiceWallet][FUND] Faucet ${wallet.network} resposta:`, faucetResponse);

    // Aguardar processamento
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return NextResponse.json({
      success: true,
      message: `Carteira fundada com sucesso na ${wallet.network}`,
      faucetResponse,
    });
  } catch (error: any) {
    console.error('[ServiceWallet][FUND] Erro ao fundar carteira:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao fundar carteira' },
      { status: 500 },
    );
  }
}

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


