import { NextRequest, NextResponse } from 'next/server';
import { ReliableSubmission } from '@/lib/xrpl/reliable-submission';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Submete transação de autorização MPT já assinada
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
    const { txBlob, network = 'testnet' } = body;

    if (!txBlob || typeof txBlob !== 'string') {
      return NextResponse.json(
        { error: 'txBlob é obrigatório' },
        { status: 400 }
      );
    }

    const rs = new ReliableSubmission(network as any);
    const result = await rs.submitAndWait(txBlob);

    return NextResponse.json({
      txHash: result.result.tx_json?.hash,
      meta: result.result.meta,
      elapsedMs: result.elapsedMs,
    });
  } catch (error: any) {
    console.error('[MPT Authorize Submit] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao submeter autorização' },
      { status: 500 }
    );
  }
}
