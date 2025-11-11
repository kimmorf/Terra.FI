import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const prisma = getPrismaClient();
        if (!prisma) {
            return NextResponse.json(
                { error: 'DATABASE_URL não configurada. Banco de dados indisponível.' },
                { status: 503 },
            );
        }

        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
        }

        const body = await request.json();
        const { tokenId, stablecoinId, totalAmount, scheduledFor, memo } = body;

        if (!tokenId || !stablecoinId || !totalAmount || Number(totalAmount) <= 0) {
            return NextResponse.json(
                { error: 'Parâmetros inválidos: tokenId, stablecoinId e totalAmount são obrigatórios.' },
                { status: 400 },
            );
        }

        const batch = await prisma.revPayoutBatch.create({
            data: {
                tokenId,
                stablecoinId,
                totalAmount: Number(totalAmount),
                network: body.network ?? 'testnet',
                memo,
                scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
                status: scheduledFor ? 'scheduled' : 'ready',
            },
        });

        return NextResponse.json(batch, { status: 201 });
    } catch (error) {
        console.error('[Payout] erro ao criar batch', error);
        return NextResponse.json(
            { error: 'Erro interno ao criar batch de payout.' },
            { status: 500 },
        );
    }
}

