import { NextRequest, NextResponse } from 'next/server';
import { CommitPurchaseSchema } from '@/lib/purchase/dto/purchase.dto';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/purchase/commit
 * Registra intenção de compra e retorna instruções de pagamento
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const dto = CommitPurchaseSchema.parse(body);

    // Verifica se buyerAddress corresponde ao usuário autenticado
    // Busca usuário completo do banco para verificar walletAddress
    const prisma = (await import('@/lib/prisma')).prisma;
    const fullUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { walletAddress: true },
    });

    if (fullUser?.walletAddress && fullUser.walletAddress !== dto.buyerAddress) {
      return NextResponse.json(
        { error: 'Endereço do comprador não corresponde ao usuário autenticado' },
        { status: 403 }
      );
    }

    const network = (dto.network || 'testnet') as 'testnet' | 'mainnet' | 'devnet';
    const service = new PurchaseService(undefined, undefined, network);

    const result = await service.commit(dto);

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('[Purchase Commit] Erro:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    // Erro de autorização ou disponibilidade
    if (error.message.includes('não autorizado') || error.message.includes('não disponível')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao registrar compra' },
      { status: 500 }
    );
  }
}
