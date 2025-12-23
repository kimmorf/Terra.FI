import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { mintMPTToHolder } from '@/lib/xrpl/mpt-helpers';
import type { XRPLNetwork } from '@/lib/xrpl/pool';

const MintSchema = z.object({
    // Identificação da carteira emissora
    walletId: z.string().optional(),
    issuerAddress: z.string().startsWith('r').optional(),
    issuerSeed: z.string().optional(),

    // Destinatário
    holderAddress: z.string().startsWith('r').min(25),

    // Token
    mptokenIssuanceID: z.string().regex(/^[A-F0-9]{48,64}$/i, 'MPTokenIssuanceID deve ter 48 ou 64 caracteres hex'),

    // Quantidade
    amount: z.string().regex(/^[0-9]+(\.[0-9]+)?$/, 'Amount deve ser um número válido'),

    // Configurações opcionais
    memo: z.string().optional(),
    network: z.enum(['testnet', 'devnet', 'mainnet']).default('testnet'),
});

/**
 * API Route para mintar MPT diretamente para um holder (investidor)
 * 
 * POST /api/mpt/mint
 * 
 * Este endpoint permite criar tokens sob demanda diretamente na carteira
 * do investidor quando ele realiza uma compra. Não é necessário ter tokens
 * "em estoque" - eles são criados no momento da transação.
 * 
 * Body:
 * {
 *   walletId?: string,           // ID da carteira de serviço (alternativa)
 *   issuerAddress?: string,      // Endereço do issuer
 *   issuerSeed?: string,         // Seed do issuer
 *   holderAddress: string,       // Endereço do investidor
 *   mptokenIssuanceID: string,   // ID do MPT (64 chars hex)
 *   amount: string,              // Quantidade a mintar
 *   memo?: string,               // Memo opcional
 *   network?: string             // testnet | devnet | mainnet
 * }
 * 
 * Resposta:
 * {
 *   success: true,
 *   txHash: string,
 *   issuer: string,
 *   holder: string,
 *   amount: string,
 *   mptokenIssuanceID: string
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validated = MintSchema.parse(body);

        const {
            walletId,
            issuerAddress: rawIssuerAddress,
            issuerSeed: rawIssuerSeed,
            holderAddress,
            mptokenIssuanceID,
            amount,
            memo,
            network: rawNetwork,
        } = validated;

        const prisma = getPrismaClient();

        let issuerAddress = rawIssuerAddress;
        let issuerSeed = rawIssuerSeed;
        let network: XRPLNetwork = rawNetwork;

        // Se walletId foi fornecido, buscar credenciais do banco
        if (walletId) {
            if (!prisma) {
                return NextResponse.json(
                    { error: 'DATABASE_URL não configurada. Configure o banco para usar walletId.' },
                    { status: 503 }
                );
            }

            const wallet = await prisma.serviceWallet.findUnique({
                where: { id: walletId }
            });

            if (!wallet) {
                return NextResponse.json(
                    { error: 'Carteira não encontrada' },
                    { status: 404 }
                );
            }

            // Verificar se a carteira é do tipo ISSUER
            if (wallet.type !== 'ISSUER') {
                return NextResponse.json(
                    { error: `Carteira do tipo ${wallet.type} não pode mintar tokens. Use uma carteira ISSUER.` },
                    { status: 400 }
                );
            }

            issuerAddress = wallet.address;
            issuerSeed = decryptSecret(wallet.seedEncrypted);
            network = wallet.network as XRPLNetwork;
        } else if (issuerAddress && !issuerSeed) {
            // Se walletId não foi fornecido, mas temos o issuerAddress, tentar encontrar a carteira
            if (!prisma) {
                return NextResponse.json(
                    { error: 'DATABASE_URL não configurada. Configure o banco para usar walletId.' },
                    { status: 503 }
                );
            }

            const wallet = await prisma.serviceWallet.findFirst({
                where: {
                    address: issuerAddress,
                    type: 'ISSUER'
                }
            });

            if (wallet) {
                console.log(`[API MPT Mint] Carteira encontrada para o issuer ${issuerAddress}`);
                issuerSeed = decryptSecret(wallet.seedEncrypted);
                network = wallet.network as XRPLNetwork;
            } else {
                console.warn(`[API MPT Mint] Carteira não encontrada para o issuer ${issuerAddress} e seed não fornecida via API.`);
                // Não falha aqui, pois pode ser que a seed tenha sido passada no request (embora o check abaixo vá falhar se não tiver)
            }
        }

        // Validar que temos as credenciais necessárias
        if (!issuerAddress || !issuerSeed) {
            return NextResponse.json(
                { error: 'issuerAddress e issuerSeed são obrigatórios (ou forneça walletId)' },
                { status: 400 }
            );
        }

        console.log('[API MPT Mint] Iniciando mint...');
        console.log('[API MPT Mint] Issuer:', issuerAddress);
        console.log('[API MPT Mint] Holder:', holderAddress);
        console.log('[API MPT Mint] MPT ID:', mptokenIssuanceID);
        console.log('[API MPT Mint] Amount:', amount);
        console.log('[API MPT Mint] Network:', network);

        // Validar se o destino já está autorizado. 
        // Se for uma carteira de serviço nossa, podemos autorizar automaticamente.
        try {
            const { isHolderAuthorized, authorizeMPTHolder } = await import('@/lib/xrpl/mpt-helpers');
            const isAuthorized = await isHolderAuthorized(holderAddress, mptokenIssuanceID, network);

            if (!isAuthorized && prisma) {
                // Tentar encontrar se o destino é uma carteira nossa
                const toWallet = await prisma.serviceWallet.findFirst({
                    where: { address: holderAddress }
                });

                if (toWallet) {
                    console.log(`[API MPT Mint] Auto-autorizando carteira de serviço destino: ${holderAddress}`);
                    await authorizeMPTHolder({
                        holderAddress: holderAddress,
                        holderSeed: decryptSecret(toWallet.seedEncrypted),
                        mptokenIssuanceID,
                        network
                    });
                }
            }
        } catch (authError: any) {
            console.warn('[API MPT Mint] Falha ao verificar/auto-autorizar:', authError.message);
            // Continuamos, pois o mintMPTToHolder tentará de qualquer forma e dará o erro tecNO_AUTH se necessário
        }

        // Executar mint
        const txHash = await mintMPTToHolder({
            issuerAddress,
            issuerSeed,
            holderAddress,
            mptokenIssuanceID,
            amount,
            memo,
            network,
        });

        console.log('[API MPT Mint] Mint concluído! Hash:', txHash);

        return NextResponse.json({
            success: true,
            txHash,
            issuer: issuerAddress,
            holder: holderAddress,
            amount,
            mptokenIssuanceID,
            network,
        });

    } catch (error: any) {
        console.error('[API MPT Mint] Erro:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    error: 'Dados inválidos',
                    details: error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
                },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                error: error.message || 'Erro ao mintar MPT',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            },
            { status: 500 }
        );
    }
}
