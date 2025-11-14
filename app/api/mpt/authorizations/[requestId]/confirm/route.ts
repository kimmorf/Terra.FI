import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { xrplPool, type XRPLNetwork } from '@/lib/xrpl/pool';

/**
 * POST /api/mpt/authorizations/:requestId/confirm
 * 
 * Confirma uma autorização pendente após assinatura no Crossmark
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada' },
        { status: 503 }
      );
    }

    const { requestId } = params;
    const body = await request.json();
    const { txHash } = body;

    if (!txHash || typeof txHash !== 'string') {
      return NextResponse.json(
        { error: 'txHash é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar autorização pendente
    const authorization = await prisma.mPTAuthorization.findUnique({
      where: { authorizationRequestId: requestId },
      include: {
        issuance: true,
      },
    });

    if (!authorization) {
      return NextResponse.json(
        { error: 'Autorização não encontrada' },
        { status: 404 }
      );
    }

    if (authorization.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Autorização já está ${authorization.status}` },
        { status: 400 }
      );
    }

    // Verificar transação no ledger
    const client = await xrplPool.getClient(authorization.network as XRPLNetwork);
    const txResponse = await client.request({
      command: 'tx',
      transaction: txHash,
    });

    const tx = txResponse.result;
    if (!tx.validated) {
      return NextResponse.json(
        { error: 'Transação ainda não foi validada no ledger' },
        { status: 400 }
      );
    }

    // Verificar se a transação é realmente uma autorização para este MPT
    const txJson = tx.Transaction || tx;
    if (
      txJson.TransactionType !== 'MPTokenAuthorize' ||
      txJson.MPTokenIssuanceID !== authorization.issuance.xrplIssuanceId ||
      txJson.Account !== authorization.walletAddress
    ) {
      return NextResponse.json(
        { error: 'Transação não corresponde à autorização esperada' },
        { status: 400 }
      );
    }

    // Atualizar autorização
    const updated = await prisma.mPTAuthorization.update({
      where: { id: authorization.id },
      data: {
        status: 'AUTHORIZED',
        authorizationTxHash: txHash,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      authorization: {
        id: updated.id,
        walletAddress: updated.walletAddress,
        walletType: updated.walletType,
        status: updated.status,
        authorizationTxHash: updated.authorizationTxHash,
      },
    });
  } catch (error: any) {
    console.error('[API MPT Confirm Authorization] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao confirmar autorização',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

