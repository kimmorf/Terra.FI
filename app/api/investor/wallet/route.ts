import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

/**
 * GET /api/investor/wallet
 * 
 * Busca uma carteira específica por ID (query param)
 * A seleção é feita apenas no cliente (localStorage), não no banco de dados.
 */
export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Configure o banco para usar carteiras.' },
        { status: 503 },
      );
    }

    // Buscar walletId da query string
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('walletId');

    if (!walletId) {
      // Se não tem walletId, retorna null (nenhuma carteira selecionada)
      return NextResponse.json({ wallet: null });
    }

    // Busca a carteira específica pelo ID
    const wallet = await prisma.serviceWallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      return NextResponse.json({ wallet: null });
    }

    const { seedEncrypted, ...sanitized } = wallet;
    return NextResponse.json({ wallet: sanitized });
  } catch (error) {
    console.error('[InvestorWallet][GET] Erro ao obter carteira:', error);
    return NextResponse.json(
      { error: 'Erro ao obter carteira' },
      { status: 500 },
    );
  }
}


