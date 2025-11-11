import { NextRequest, NextResponse } from 'next/server';
import { QuotePurchaseSchema } from '@/lib/purchase/dto/purchase.dto';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/purchase/quote
 * Retorna cotação de preço para compra de MPT
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
    const dto = QuotePurchaseSchema.parse(body);

    const network = (dto.network || 'testnet') as 'testnet' | 'mainnet' | 'devnet';
    const service = new PurchaseService(undefined, undefined, network);

    const quote = await service.quote(dto);

    return NextResponse.json(quote);
  } catch (error: any) {
    console.error('[Purchase Quote] Erro:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao gerar cotação' },
      { status: 500 }
    );
  }
}
