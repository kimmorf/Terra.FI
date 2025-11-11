/**
 * Purchase Service
 * Gerencia fluxo de compra primária com idempotência e locks
 * Estados: PENDING → FUNDS_CONFIRMED → MPT_SENT → COMPLETED
 */

import { getPrismaClient } from '../prisma';
import { reliableSubmitV2 } from '../xrpl/reliable-submission-v2';
import { structuredLog } from '../logging/structured-logger';
import { buildPaymentTransaction } from '../crossmark/transactions';
import { generateIdempotencyKey } from '../xrpl/reliable-submission-v2';

export interface CreatePurchaseParams {
  purchaseId: string; // Chave idempotente externa
  userId: string;
  projectId?: string;
  amount: number;
  currency: string;
  mptCurrency: string;
  mptAmount: string;
  mptIssuer: string;
  network: 'testnet' | 'mainnet' | 'devnet';
  fundsTxHash?: string; // Se já confirmado
}

export interface PurchaseStatus {
  id: string;
  purchaseId: string;
  status: string;
  mptTxHash?: string | null;
  retryCount: number;
  lastError?: string | null;
  actionRequired?: string | null;
}

const LOCK_TIMEOUT = 30000; // 30 segundos

/**
 * Cria ou recupera purchase (idempotente)
 */
export async function createOrGetPurchase(
  params: CreatePurchaseParams
): Promise<PurchaseStatus> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database not available');
  }

  // Verifica se já existe
  const existing = await prisma.purchase.findUnique({
    where: { purchaseId: params.purchaseId },
  });

  if (existing) {
    structuredLog('purchase_exists', {
      purchaseId: params.purchaseId,
      status: existing.status,
    });

    return {
      id: existing.id,
      purchaseId: existing.purchaseId,
      status: existing.status,
      mptTxHash: existing.mptTxHash || undefined,
      retryCount: existing.retryCount,
      lastError: existing.lastError || undefined,
      actionRequired: existing.actionRequired || undefined,
    };
  }

  // Cria novo purchase
  const purchase = await prisma.purchase.create({
    data: {
      purchaseId: params.purchaseId,
      userId: params.userId,
      projectId: params.projectId || null,
      amount: params.amount,
      currency: params.currency,
      mptCurrency: params.mptCurrency,
      mptAmount: params.mptAmount,
      mptIssuer: params.mptIssuer,
      status: params.fundsTxHash ? 'FUNDS_CONFIRMED' : 'PENDING',
      fundsTxHash: params.fundsTxHash || null,
      metadata: {
        network: params.network,
        createdAt: new Date().toISOString(),
      },
    },
  });

  structuredLog('purchase_created', {
    purchaseId: params.purchaseId,
    status: purchase.status,
  });

  return {
    id: purchase.id,
    purchaseId: purchase.purchaseId,
    status: purchase.status,
    retryCount: 0,
  };
}

/**
 * Adquire lock pessimista para processar purchase
 */
async function acquireLock(
  purchaseId: string,
  processorId: string
): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return false;
  }

  try {
    // Tenta adquirir lock usando transação
    const result = await prisma.$executeRaw`
      UPDATE "Purchase"
      SET "lockedAt" = NOW(), "lockedBy" = ${processorId}
      WHERE "purchaseId" = ${purchaseId}
        AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '30 seconds')
        AND "status" IN ('FUNDS_CONFIRMED', 'ACTION_REQUIRED')
    `;

    return (result as number) > 0;
  } catch (error) {
    structuredLog('lock_acquisition_failed', {
      purchaseId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Libera lock
 */
async function releaseLock(purchaseId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  await prisma.purchase.updateMany({
    where: { purchaseId },
    data: {
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/**
 * Processa envio de MPT para purchase
 * Estado: FUNDS_CONFIRMED → MPT_SENT
 */
export async function processMPTSend(
  purchaseId: string,
  issuerAddress: string,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet'
): Promise<{ success: boolean; txHash?: string; error?: string; actionRequired?: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database not available');
  }

  const processorId = `processor_${Date.now()}`;

  // Adquire lock
  const locked = await acquireLock(purchaseId, processorId);
  if (!locked) {
    return {
      success: false,
      error: 'Could not acquire lock or purchase not in valid state',
    };
  }

  try {
    // Busca purchase
    const purchase = await prisma.purchase.findUnique({
      where: { purchaseId },
    });

    if (!purchase) {
      return { success: false, error: 'Purchase not found' };
    }

    // Se já foi enviado, retorna sucesso
    if (purchase.status === 'MPT_SENT' && purchase.mptTxHash) {
      structuredLog('mpt_already_sent', {
        purchaseId,
        mptTxHash: purchase.mptTxHash,
      });

      return {
        success: true,
        txHash: purchase.mptTxHash,
      };
    }

    // Verifica se está em estado válido
    if (purchase.status !== 'FUNDS_CONFIRMED' && purchase.status !== 'ACTION_REQUIRED') {
      return {
        success: false,
        error: `Invalid status for MPT send: ${purchase.status}`,
      };
    }

    // Se ACTION_REQUIRED, verifica se foi resolvido
    if (purchase.status === 'ACTION_REQUIRED') {
      // Verifica se ação foi resolvida (ex: autorização feita)
      // Por enquanto, permite retry
    }

    // Prepara transação de envio de MPT
    // Nota: Em produção, isso viria do Crossmark ou seria assinado no backend
    const idempotencyKey = generateIdempotencyKey();

    structuredLog('mpt_send_start', {
      purchaseId,
      mptCurrency: purchase.mptCurrency,
      mptAmount: purchase.mptAmount,
      mptIssuer: purchase.mptIssuer,
      retryCount: purchase.retryCount,
    });

    // Implementação real: usar MptService para enviar MPT
    const { MptService } = await import('../mpt/mpt.service');
    const mptService = new MptService(process.env.XRPL_ISSUER_SECRET, network);

    // Buscar issuanceIdHex do metadata do purchase
    const metadata = (purchase.metadata as any) || {};
    const issuanceIdHex = metadata.issuanceIdHex || metadata.mptokenIssuanceID;

    if (!issuanceIdHex) {
      throw new Error('MPTokenIssuanceID não encontrado no metadata do purchase');
    }

    // Buscar endereço do comprador do metadata
    const buyerAddress = (purchase.metadata as any)?.buyerAddress;
    if (!buyerAddress) {
      throw new Error('Endereço do comprador não encontrado');
    }

    let result: {
      success: boolean;
      txHash?: string | null;
      engineResult?: string;
      error?: string;
    };

    try {
      // Enviar MPT usando MptService
      if (!purchase.mptAmount) {
        throw new Error('mptAmount não está definido no purchase');
      }

      const sendResult = await mptService.send({
        mptIssuanceIdHex: issuanceIdHex,
        amount: purchase.mptAmount,
        destination: buyerAddress,
      }, process.env.XRPL_ISSUER_SECRET);

      result = {
        success: true,
        txHash: sendResult.txHash || null,
      };
    } catch (error: any) {
      // Extrair engineResult do erro se disponível
      const engineResult = error.engineResult || error.result?.engine_result || 
                          (error.message?.includes('tecNO_AUTH') ? 'tecNO_AUTH' : 
                           error.message?.includes('tecNO_LINE') ? 'tecNO_LINE' : undefined);

      result = {
        success: false,
        txHash: null,
        engineResult,
        error: error.message || 'Erro ao enviar MPT',
      };
    }

    // Atualiza purchase baseado no resultado
    if (result.success && result.txHash) {
      await prisma.purchase.update({
        where: { purchaseId },
        data: {
          status: 'MPT_SENT',
          mptTxHash: result.txHash,
          retryCount: purchase.retryCount + 1,
          lastError: null,
          actionRequired: null,
        },
      });

      structuredLog('mpt_send_success', {
        purchaseId,
        mptTxHash: result.txHash,
      });

      return {
        success: true,
        txHash: result.txHash,
      };
    } else {
      // Verifica se é erro que requer ação
      const requiresAction = result.engineResult === 'tecNO_AUTH' || 
                            result.engineResult === 'tecNO_LINE';

      const newStatus = requiresAction ? 'ACTION_REQUIRED' : 'FAILED';
      const actionRequired = requiresAction 
        ? (result.engineResult === 'tecNO_AUTH' ? 'RequireAuth' : 'Trustline')
        : null;

      await prisma.purchase.update({
        where: { purchaseId },
        data: {
          status: newStatus,
          retryCount: purchase.retryCount + 1,
          lastError: result.error || result.engineResult,
          engineResult: result.engineResult,
          actionRequired,
        },
      });

      structuredLog('mpt_send_failed', {
        purchaseId,
        engineResult: result.engineResult,
        actionRequired,
        retryCount: purchase.retryCount + 1,
      });

      return {
        success: false,
        error: result.error,
        actionRequired: actionRequired || undefined,
      };
    }
  } finally {
    await releaseLock(purchaseId);
  }
}

/**
 * Marca purchase como FUNDS_CONFIRMED
 */
export async function confirmFunds(
  purchaseId: string,
  fundsTxHash: string
): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return false;
  }

  try {
    await prisma.purchase.update({
      where: { purchaseId },
      data: {
        status: 'FUNDS_CONFIRMED',
        fundsTxHash,
      },
    });

    structuredLog('funds_confirmed', {
      purchaseId,
      fundsTxHash,
    });

    return true;
  } catch (error) {
    structuredLog('funds_confirm_failed', {
      purchaseId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
