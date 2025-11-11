import { NextRequest, NextResponse } from 'next/server';
import { AuthorizeMPTSchema } from '@/lib/mpt/dto/authorize-mpt.dto';
import { MptService } from '@/lib/mpt/mpt.service';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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
    const dto = AuthorizeMPTSchema.parse(body);

    // Determinar rede
    const network = (body.network as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

    const service = new MptService(undefined, network);
    
    // Se holderSeed vier no body, assina no backend
    // Caso contrário, retorna tx preparada para assinatura no frontend
    const holderSeed = body.holderSeed as string | undefined;
    const result = await service.authorize(dto, holderSeed);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[MPT Authorize] Erro:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao autorizar MPT' },
      { status: 500 }
    );
  }
}
