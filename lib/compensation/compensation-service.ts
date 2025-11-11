/**
 * Compensation Service
 * Gerencia compensações para purchases falhados
 * Tipos: REFUND, RETRY_MPT, MANUAL
 */

import { getPrismaClient } from '../prisma';
import { structuredLog } from '../logging/structured-logger';
import { reliableSubmitV2 } from '../xrpl/reliable-submission-v2';
import { buildPaymentTransaction } from '../crossmark/transactions';

export interface CompensationRequest {
  purchaseId: string;
  type: 'REFUND' | 'RETRY_MPT' | 'MANUAL';
  reason: string;
  approvedBy?: string;
}

export interface CompensationResult {
  success: boolean;
  compensationId: string;
  executed: boolean;
  txHash?: string;
  error?: string;
}

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Cria requisição de compensação
 */
export async function createCompensation(
  request: CompensationRequest
): Promise<CompensationResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database not available');
  }

  // Verifica se purchase existe
  const purchase = await prisma.purchase.findUnique({
    where: { purchaseId: request.purchaseId },
  });

  if (!purchase) {
    throw new Error('Purchase not found');
  }

  // Verifica se já existe compensação
  const existing = await prisma.compensation.findUnique({
    where: { purchaseId: request.purchaseId },
  });

  if (existing) {
    return {
      success: true,
      compensationId: existing.id,
      executed: existing.status === 'EXECUTED',
      txHash: existing.refundTxHash || existing.retryMptTxHash || undefined,
    };
  }

  // Cria compensação
  const compensation = await prisma.compensation.create({
    data: {
      purchaseId: request.purchaseId,
      type: request.type,
      reason: request.reason,
      status: request.approvedBy ? 'APPROVED' : 'PENDING',
      approvedBy: request.approvedBy || null,
      approvedAt: request.approvedBy ? new Date() : null,
      metadata: {
        requestedAt: new Date().toISOString(),
      },
    },
  });

  // Atualiza purchase
  await prisma.purchase.update({
    where: { purchaseId: request.purchaseId },
    data: {
      status: 'COMPENSATION_REQUIRED',
      compensationId: compensation.id,
    },
  });

  structuredLog('compensation_created', {
    compensationId: compensation.id,
    purchaseId: request.purchaseId,
    type: request.type,
    reason: request.reason,
  });

  // Se foi aprovado automaticamente, executa
  if (request.approvedBy) {
    return await executeCompensation(compensation.id);
  }

  return {
    success: true,
    compensationId: compensation.id,
    executed: false,
  };
}

/**
 * Aprova compensação
 */
export async function approveCompensation(
  compensationId: string,
  approvedBy: string
): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return false;
  }

  try {
    await prisma.compensation.update({
      where: { id: compensationId },
      data: {
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date(),
      },
    });

    structuredLog('compensation_approved', {
      compensationId,
      approvedBy,
    });

    return true;
  } catch (error) {
    structuredLog('compensation_approval_failed', {
      compensationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Executa compensação
 */
export async function executeCompensation(
  compensationId: string
): Promise<CompensationResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database not available');
  }

  const compensation = await prisma.compensation.findUnique({
    where: { id: compensationId },
  });

  if (!compensation) {
    throw new Error('Compensation not found');
  }

  if (compensation.status !== 'APPROVED') {
    throw new Error('Compensation not approved');
  }

  // Busca purchase separadamente
  const purchase = await prisma.purchase.findUnique({
    where: { purchaseId: compensation.purchaseId },
  });

  if (!purchase) {
    throw new Error('Purchase not found');
  }

  try {
    let txHash: string | undefined;
    let success = false;

    if (compensation.type === 'REFUND') {
      // Executa refund (Payment inverso)
      // Nota: Em produção, isso requer autorização administrativa e validação
      const refundTx = buildPaymentTransaction({
        sender: purchase.mptIssuer || '', // Issuer devolve
        destination: purchase.userId, // Para o comprador
        amount: purchase.amount.toString(),
        currency: purchase.currency,
        issuer: purchase.mptIssuer || '',
        memo: `Refund for purchase ${purchase.purchaseId}`,
      });

      // Aqui você integraria com o sistema real de envio
      // const result = await reliableSubmitV2(refundTxBlob, network, {...});
      
      // Por enquanto, simula
      txHash = undefined; // result.txHash;
      success = false; // result.success;

      if (success && txHash) {
        await prisma.compensation.update({
          where: { id: compensationId },
          data: {
            status: 'EXECUTED',
            executedAt: new Date(),
            refundTxHash: txHash,
          },
        });

        await prisma.purchase.update({
          where: { purchaseId: purchase.purchaseId },
          data: {
            status: 'COMPLETED',
          },
        });
      }
    } else if (compensation.type === 'RETRY_MPT') {
      // Retenta envio de MPT
      // Integra com processMPTSend
      // Por enquanto, simula
      success = false;
    }

    if (!success) {
      await prisma.compensation.update({
        where: { id: compensationId },
        data: {
          status: 'FAILED',
        },
      });
    }

    structuredLog('compensation_executed', {
      compensationId,
      type: compensation.type,
      success,
      txHash,
    });

    return {
      success,
      compensationId,
      executed: success,
      txHash,
    };
  } catch (error) {
    await prisma.compensation.update({
      where: { id: compensationId },
      data: {
        status: 'FAILED',
      },
    });

    structuredLog('compensation_execution_failed', {
      compensationId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      compensationId,
      executed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Playbook: Verifica se compensação é necessária
 */
export async function checkCompensationRequired(
  purchaseId: string
): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return false;
  }

  const purchase = await prisma.purchase.findUnique({
    where: { purchaseId },
  });

  if (!purchase) {
    return false;
  }

  // Critérios para compensação:
  // 1. Retry count >= MAX_RETRY_ATTEMPTS
  // 2. Status = FAILED ou ACTION_REQUIRED por muito tempo
  // 3. Erro não retryable

  if (purchase.retryCount >= MAX_RETRY_ATTEMPTS) {
    return true;
  }

  if (purchase.status === 'FAILED') {
    // Verifica se erro é não retryable
    const nonRetryableErrors = ['tecUNFUNDED_PAYMENT', 'tecINSUF_RESERVE_LINE'];
    if (purchase.engineResult && nonRetryableErrors.includes(purchase.engineResult)) {
      return true;
    }
  }

  // ACTION_REQUIRED por mais de 1 hora
  if (purchase.status === 'ACTION_REQUIRED') {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (purchase.updatedAt < oneHourAgo) {
      return true;
    }
  }

  return false;
}
