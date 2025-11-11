import { NextRequest, NextResponse } from 'next/server';
import { ConfirmPurchaseSchema } from '@/lib/purchase/dto/purchase.dto';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/purchase/confirm
 * Confirma pagamento e dispara envio de MPT (perna 2)
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
    const dto = ConfirmPurchaseSchema.parse(body);

    const network = (dto.network || 'testnet') as 'testnet' | 'mainnet' | 'devnet';
    const service = new PurchaseService(undefined, undefined, network);

    const result = await service.confirm(dto);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Purchase Confirm] Erro:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    // Erro de compensação
    if (error.message.includes('Compensação necessária')) {
      return NextResponse.json(
        { error: error.message, requiresCompensation: true },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao confirmar compra' },
      { status: 500 }
    );
  }
}
