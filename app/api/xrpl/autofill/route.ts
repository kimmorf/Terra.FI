import { NextRequest, NextResponse } from 'next/server';
import { xrplPool } from '@/lib/xrpl/pool';

export const dynamic = 'force-dynamic';

/**
 * Endpoint utilitário para autofill de transações XRPL
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tx, network = 'testnet' } = body;

    if (!tx || !tx.TransactionType) {
      return NextResponse.json(
        { error: 'Transação inválida' },
        { status: 400 }
      );
    }

    const client = await xrplPool.getClient(network as any);
    
    try {
      const prepared = await client.autofill(tx);
      return NextResponse.json({ prepared });
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Erro ao fazer autofill' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[XRPL Autofill] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao processar autofill' },
      { status: 500 }
    );
  }
}
