import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { xrplPool, type XRPLNetwork } from '@/lib/xrpl/pool';
import { ReliableSubmission } from '@/lib/xrpl/reliable-submission';
import { Wallet } from 'xrpl';
import { MintToDistributionSchema } from '@/lib/mpt/dto/mint-to-distribution.dto';
import { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * POST /api/mpt/issuances/:id/mint-to-distribution
 * 
 * Emite (ou transfere) o supply inicial da emissão para a carteira de distribuição
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
    const validated = MintToDistributionSchema.parse(body);

    // 1. Buscar emissão
    const issuance = await prisma.mPTIssuance.findUnique({
      where: { id },
      include: {
        issuerWallet: true,
        distributionWallet: true,
      },
    });

    if (!issuance) {
      return NextResponse.json(
        { error: 'Emissão MPT não encontrada' },
        { status: 404 }
      );
    }

    if (!issuance.distributionWallet) {
      return NextResponse.json(
        { error: 'Carteira de distribuição não configurada para esta emissão' },
        { status: 400 }
      );
    }

    if (!issuance.xrplIssuanceId) {
      return NextResponse.json(
        { error: 'Emissão ainda não foi criada on-chain' },
        { status: 400 }
      );
    }

    // 2. Validar amount
    const amountDecimal = new Decimal(validated.amount);
    const maximumAmountDecimal = new Decimal(issuance.maximumAmount);
    const totalMintedDecimal = new Decimal(issuance.totalMinted);
    const newTotalMinted = totalMintedDecimal.plus(amountDecimal);

    if (issuance.maximumAmount !== '0' && newTotalMinted.gt(maximumAmountDecimal)) {
      return NextResponse.json(
        {
          error: `Quantidade excede o máximo permitido. Máximo: ${issuance.maximumAmount}, Já emitido: ${issuance.totalMinted}, Tentando emitir: ${validated.amount}`,
        },
        { status: 400 }
      );
    }

    // 3. Obter seeds
    const issuerSeed = decryptSecret(issuance.issuerWallet.seedEncrypted);
    const issuerWallet = Wallet.fromSeed(issuerSeed);

    // 4. Preparar transação Payment com MPT
    const client = await xrplPool.getClient(issuance.network as XRPLNetwork);

    const tx: any = {
      TransactionType: 'Payment',
      Account: issuance.issuerWallet.address,
      Destination: issuance.distributionWallet.address,
      Amount: {
        mpt_issuance_id: issuance.xrplIssuanceId,
        value: validated.amount,
      },
    };

    // 5. Autofill, assinar e submeter
    const prepared = await client.autofill(tx);
    const signed = issuerWallet.sign(prepared);
    const rs = new ReliableSubmission(issuance.network as XRPLNetwork);
    const result = await rs.submitAndWait(signed.tx_blob);

    const txHash = result.result.tx_json?.hash;
    if (!txHash) {
      throw new Error('Não foi possível obter hash da transação');
    }

    // 6. Atualizar banco
    const updatedIssuance = await prisma.mPTIssuance.update({
      where: { id },
      data: {
        totalMinted: newTotalMinted.toString(),
        distributionBalance: new Decimal(issuance.distributionBalance)
          .plus(amountDecimal)
          .toString(),
        status: issuance.status === 'CREATED' ? 'MINTED' : issuance.status,
      },
      include: {
        distributionWallet: {
          select: {
            id: true,
            address: true,
            label: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      txHash,
      issuance: {
        id: updatedIssuance.id,
        totalMinted: updatedIssuance.totalMinted,
        distributionBalance: updatedIssuance.distributionBalance,
        status: updatedIssuance.status,
        distributionWallet: updatedIssuance.distributionWallet,
      },
    });
  } catch (error: any) {
    console.error('[API MPT Mint to Distribution] Erro:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || 'Erro ao emitir tokens para distribuição',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

