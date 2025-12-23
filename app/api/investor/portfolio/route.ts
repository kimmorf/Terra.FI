import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/investor/portfolio
 * 
 * Retorna o portfólio unificado do investidor logado ou pela carteira fornecida.
 * Inclui investimentos em projetos padrão e aquisições de tokens MPT.
 */
export async function GET(request: NextRequest) {
    try {
        const prisma = getPrismaClient();
        if (!prisma) {
            return NextResponse.json(
                { error: 'DATABASE_URL não configurada.' },
                { status: 503 },
            );
        }

        // Tentar obter sessão
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        // Se não tem sessão, tentar buscar pelo walletAddress da query
        const { searchParams } = new URL(request.url);
        const queryWallet = searchParams.get('walletAddress');

        let userId = session?.user?.id;
        let walletAddress = (session?.user as any)?.walletAddress || queryWallet;

        if (!userId && walletAddress) {
            const user = await prisma.user.findUnique({
                where: { walletAddress: walletAddress }
            });
            userId = user?.id;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
        }

        // 1. Buscar investimentos em projetos tradicionais
        const investments = await prisma.investment.findMany({
            where: {
                userId,
                status: 'confirmed',
            },
            include: {
                project: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // 2. Buscar compras de MPT
        const purchases = await prisma.purchase.findMany({
            where: {
                userId,
                status: 'COMPLETED',
            },
            orderBy: { createdAt: 'desc' },
        });

        // 3. Buscar os metadados dos MPTs para enriquecer as compras
        const mptIssuanceIds = [...new Set(purchases.map(p => p.mptCurrency).filter(Boolean) as string[])];
        const mptIssuances = await prisma.mPTIssuance.findMany({
            where: {
                xrplIssuanceId: { in: mptIssuanceIds }
            }
        });

        // 4. Normalizar tudo para um formato de "PortfolioItem"
        const portfolio = [
            ...investments.map(inv => ({
                id: inv.id,
                type: 'PROJECT',
                name: inv.project.name,
                category: inv.project.type,
                amount: inv.amount,
                date: inv.createdAt,
                status: inv.status,
                txHash: inv.txHash,
                metadata: {
                    purpose: inv.project.purpose,
                    projectId: inv.projectId
                }
            })),
            ...purchases.map(p => {
                const issuance = mptIssuances.find(i => i.xrplIssuanceId === p.mptCurrency);
                return {
                    id: p.id,
                    type: 'MPT',
                    name: issuance?.name || p.mptCurrency || 'Token MPT',
                    category: issuance?.type || 'TOKEN',
                    amount: p.amount,
                    tokenAmount: p.mptAmount,
                    date: p.createdAt,
                    status: p.status,
                    txHash: p.mptTxHash,
                    metadata: {
                        issuanceId: p.mptCurrency,
                        issuer: p.mptIssuer,
                        symbol: issuance?.symbol
                    }
                };
            })
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json({
            success: true,
            portfolio,
            summary: {
                totalInvestments: investments.length + purchases.length,
                totalAmountBRL: portfolio.reduce((sum, item) => sum + item.amount, 0)
            }
        });

    } catch (error: any) {
        console.error('[Portfolio API] Erro:', error);
        return NextResponse.json(
            { error: 'Erro ao carregar portfólio' },
            { status: 500 }
        );
    }
}
