import { NextRequest, NextResponse } from 'next/server';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/purchase/:id
 * Retorna estado atual e detalhes da compra
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verificar autenticação
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const purchaseId = params.id;
    const network = (request.nextUrl.searchParams.get('network') || 'testnet') as 'testnet' | 'mainnet' | 'devnet';

    const service = new PurchaseService(undefined, undefined, network);
    const result = await service.getPurchase(purchaseId);

    // Verifica se o usuário tem permissão para ver esta compra
    const userWalletAddress = (session.user as any).walletAddress;
    if (
      userWalletAddress &&
      result.purchase.buyerAddress !== userWalletAddress
    ) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Purchase Get] Erro:', error);

    if (error.message.includes('não encontrada')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao buscar compra' },
      { status: 500 }
    );
  }
}
