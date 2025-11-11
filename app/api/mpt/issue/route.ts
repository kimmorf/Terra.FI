import { NextRequest, NextResponse } from 'next/server';
import { IssueMPTSchema } from '@/lib/mpt/dto/issue-mpt.dto';
import { MptService } from '@/lib/mpt/mpt.service';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação (apenas admins podem emitir)
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
    const dto = IssueMPTSchema.parse(body);

    // Determinar rede (pode vir do body ou usar padrão)
    const network = (body.network as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

    const service = new MptService(undefined, network);
    const result = await service.issue(dto);

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('[MPT Issue] Erro:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao emitir MPT' },
      { status: 500 }
    );
  }
}
