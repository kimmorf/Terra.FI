import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { authorizeMPTHolder } from '@/lib/xrpl/mpt-helpers';
import { AuthorizeWalletSchema } from '@/lib/mpt/dto/authorize-wallet.dto';
import { z } from 'zod';
import { randomUUID } from 'crypto';

/**
 * POST /api/mpt/issuances/:id/authorize-wallet
 * 
 * Autoriza uma carteira (Crossmark ou interna) a receber MPT
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada' },
        { status: 503 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const validated = AuthorizeWalletSchema.parse(body);

    // 1. Buscar emissão
    const issuance = await prisma.mPTIssuance.findUnique({
      where: { id },
    });

    if (!issuance) {
      return NextResponse.json(
        { error: 'Emissão MPT não encontrada' },
        { status: 404 }
      );
    }

    if (!issuance.xrplIssuanceId) {
      return NextResponse.json(
        { error: 'Emissão ainda não foi criada on-chain' },
        { status: 400 }
      );
    }

    // Verificar se RequireAuth está ativo
    const flags = issuance.flags as any;
    if (!flags.requireAuth) {
      return NextResponse.json(
        { error: 'Este MPT não requer autorização (RequireAuth = false)' },
        { status: 400 }
      );
    }

    let walletAddress: string;
    let walletId: string | null = null;

    // 2. Processar conforme o tipo de carteira
    if (validated.walletType === 'internal') {
      // Carteira interna (custodial)
      if (!validated.walletId) {
        return NextResponse.json(
          { error: 'walletId é obrigatório para carteiras internas' },
          { status: 400 }
        );
      }

      const wallet = await prisma.serviceWallet.findUnique({
        where: { id: validated.walletId },
      });

      if (!wallet) {
        return NextResponse.json(
          { error: 'Carteira interna não encontrada' },
          { status: 404 }
        );
      }

      if (wallet.type !== 'USER_INTERNAL') {
        return NextResponse.json(
          { error: 'Carteira deve ser do tipo USER_INTERNAL' },
          { status: 400 }
        );
      }

      walletAddress = wallet.address;
      walletId = wallet.id;

      // Verificar se já existe autorização
      const existingAuth = await prisma.mPTAuthorization.findUnique({
        where: {
          issuanceId_walletAddress: {
            issuanceId: id,
            walletAddress: walletAddress,
          },
        },
      });

      if (existingAuth && existingAuth.status === 'AUTHORIZED') {
        return NextResponse.json(
          { error: 'Carteira já está autorizada para este MPT' },
          { status: 400 }
        );
      }

      // Autorizar on-chain (backend assina)
      const walletSeed = decryptSecret(wallet.seedEncrypted);
      const txHash = await authorizeMPTHolder({
        holderAddress: walletAddress,
        holderSeed: walletSeed,
        mptokenIssuanceID: issuance.xrplIssuanceId,
        authorize: true,
        network: issuance.network as any,
      });

      // Salvar autorização
      const authorization = await prisma.mPTAuthorization.upsert({
        where: {
          issuanceId_walletAddress: {
            issuanceId: id,
            walletAddress: walletAddress,
          },
        },
        create: {
          issuanceId: id,
          walletId: walletId,
          walletAddress: walletAddress,
          walletType: 'internal',
          status: 'AUTHORIZED',
          authorizationTxHash: txHash,
          network: issuance.network,
        },
        update: {
          status: 'AUTHORIZED',
          authorizationTxHash: txHash,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        authorization: {
          id: authorization.id,
          walletAddress: authorization.walletAddress,
          walletType: authorization.walletType,
          status: authorization.status,
          authorizationTxHash: authorization.authorizationTxHash,
        },
      });
    } else {
      // Carteira Crossmark (não custodial)
      if (!validated.address) {
        return NextResponse.json(
          { error: 'address é obrigatório para carteiras Crossmark' },
          { status: 400 }
        );
      }

      walletAddress = validated.address;

      // Verificar se já existe autorização
      const existingAuth = await prisma.mPTAuthorization.findUnique({
        where: {
          issuanceId_walletAddress: {
            issuanceId: id,
            walletAddress: walletAddress,
          },
        },
      });

      if (existingAuth && existingAuth.status === 'AUTHORIZED') {
        return NextResponse.json(
          { error: 'Carteira já está autorizada para este MPT' },
          { status: 400 }
        );
      }

      // Criar autorização pendente
      const authorizationRequestId = randomUUID();
      const authorization = await prisma.mPTAuthorization.upsert({
        where: {
          issuanceId_walletAddress: {
            issuanceId: id,
            walletAddress: walletAddress,
          },
        },
        create: {
          issuanceId: id,
          walletAddress: walletAddress,
          walletType: 'crossmark',
          status: 'PENDING',
          authorizationRequestId: authorizationRequestId,
          network: issuance.network,
          metadata: {
            requiresUserSignature: true,
          },
        },
        update: {
          status: 'PENDING',
          authorizationRequestId: authorizationRequestId,
          updatedAt: new Date(),
        },
      });

      // Retornar dados para o frontend assinar com Crossmark
      return NextResponse.json({
        success: true,
        authorization: {
          id: authorization.id,
          authorizationRequestId: authorization.authorizationRequestId,
          walletAddress: authorization.walletAddress,
          walletType: authorization.walletType,
          status: authorization.status,
        },
        requiresSignature: true,
        mptInfo: {
          issuanceId: issuance.xrplIssuanceId,
          symbol: issuance.symbol,
          name: issuance.name,
          issuerAddress: issuance.issuerWalletId, // Será resolvido no frontend
        },
      });
    }
  } catch (error: any) {
    console.error('[API MPT Authorize Wallet] Erro:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || 'Erro ao autorizar carteira',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

