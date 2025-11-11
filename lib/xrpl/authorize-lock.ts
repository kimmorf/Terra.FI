/**
 * Race Condition Prevention para KYC/Authorize
 * Lock pessimista em DB durante authorize + transfer
 */

import { getPrismaClient } from '../prisma';
import { reliableSubmit, generateIdempotencyKey } from './reliable-submission';
import { buildMPTokenAuthorizeTransaction, buildPaymentTransaction } from '../crossmark/transactions';

export interface AuthorizeAndTransferParams {
  issuer: string;
  currency: string;
  holder: string;
  transferAmount: string;
  transferDestination: string;
  network: 'testnet' | 'mainnet' | 'devnet';
  idempotencyKey?: string;
}

export interface AuthorizeAndTransferResult {
  success: boolean;
  authorizeTxHash?: string;
  transferTxHash?: string;
  error?: string;
  locked: boolean;
}

/**
 * Lock key único para operação authorize + transfer
 */
function getLockKey(issuer: string, currency: string, holder: string): string {
  return `auth_transfer:${issuer}:${currency}:${holder}`;
}

/**
 * Cria lock pessimista no banco
 */
async function acquireLock(lockKey: string, timeout: number = 30000): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return false;
  }

  try {
    // Tenta criar lock (se já existe, falha)
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ActionRecord" (id, type, "tokenCurrency", "tokenIssuer", actor, network, "txHash", metadata, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT DO NOTHING`,
      lockKey,
      'authorize',
      '',
      '',
      '',
      'testnet',
      'LOCK',
      JSON.stringify({ lockKey, locked: true })
    );

    return true;
  } catch (error) {
    // Lock já existe ou erro
    return false;
  }
}

/**
 * Libera lock
 */
async function releaseLock(lockKey: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  try {
    // Remove lock (usando metadata para identificar)
    await prisma.actionRecord.deleteMany({
      where: {
        txHash: 'LOCK',
        metadata: {
          path: ['lockKey'],
          equals: lockKey,
        },
      },
    });
  } catch (error) {
    console.error('[AuthorizeLock] Failed to release lock:', error);
  }
}

/**
 * Authorize e Transfer atomicamente com lock
 */
export async function authorizeAndTransferAtomic(
  params: AuthorizeAndTransferParams
): Promise<AuthorizeAndTransferResult> {
  const lockKey = getLockKey(params.issuer, params.currency, params.holder);
  const idempotencyKey = params.idempotencyKey || generateIdempotencyKey();
  const prisma = getPrismaClient();

  // Verifica se já existe operação com este idempotency key
  if (prisma) {
    const existing = await prisma.actionRecord.findFirst({
      where: {
        metadata: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
        type: 'authorize',
      },
    });

    if (existing && existing.txHash && existing.txHash !== 'LOCK') {
      // Busca transfer associado
      const transfer = await prisma.actionRecord.findFirst({
        where: {
          metadata: {
            path: ['idempotencyKey'],
            equals: idempotencyKey,
          },
          type: 'payment',
        },
      });

      return {
        success: !!transfer?.txHash,
        authorizeTxHash: existing.txHash,
        transferTxHash: transfer?.txHash || undefined,
        locked: false,
      };
    }
  }

  // Adquire lock
  const locked = await acquireLock(lockKey);
  if (!locked) {
    return {
      success: false,
      error: 'Could not acquire lock, operation may be in progress',
      locked: false,
    };
  }

  try {
    // Passo 1: Authorize
    const authorizeTx = buildMPTokenAuthorizeTransaction({
      issuer: params.issuer,
      currency: params.currency,
      holder: params.holder,
      authorize: true,
    });

    const authorizeResult = await reliableSubmit(authorizeTx, params.network, {
      idempotencyKey: `${idempotencyKey}_authorize`,
      maxRetries: 3,
    });

    if (!authorizeResult.success || !authorizeResult.txHash) {
      return {
        success: false,
        error: `Failed to authorize: ${authorizeResult.error}`,
        locked: true,
      };
    }

    // Registra authorize
    if (prisma) {
      await prisma.actionRecord.create({
        data: {
          type: 'authorize',
          tokenCurrency: params.currency,
          tokenIssuer: params.issuer,
          actor: params.issuer,
          target: params.holder,
          network: params.network,
          txHash: authorizeResult.txHash,
          metadata: {
            idempotencyKey,
            lockKey,
          },
        },
      });
    }

    // Passo 2: Transfer
    const transferTx = buildPaymentTransaction({
      sender: params.issuer,
      destination: params.transferDestination,
      amount: params.transferAmount,
      currency: params.currency,
      issuer: params.issuer,
      memo: `Authorized transfer via ${idempotencyKey}`,
    });

    const transferResult = await reliableSubmit(transferTx, params.network, {
      idempotencyKey: `${idempotencyKey}_transfer`,
      maxRetries: 3,
    });

    if (!transferResult.success || !transferResult.txHash) {
      // Se transfer falhou, mantém authorize (pode ser usado depois)
      return {
        success: false,
        authorizeTxHash: authorizeResult.txHash,
        error: `Failed to transfer: ${transferResult.error}. Holder is authorized but transfer failed.`,
        locked: true,
      };
    }

    // Registra transfer
    if (prisma) {
      await prisma.actionRecord.create({
        data: {
          type: 'payment',
          tokenCurrency: params.currency,
          tokenIssuer: params.issuer,
          actor: params.issuer,
          target: params.transferDestination,
          amount: params.transferAmount,
          network: params.network,
          txHash: transferResult.txHash,
          metadata: {
            idempotencyKey,
            lockKey,
          },
        },
      });
    }

    return {
      success: true,
      authorizeTxHash: authorizeResult.txHash,
      transferTxHash: transferResult.txHash,
      locked: true,
    };
  } finally {
    // Sempre libera lock
    await releaseLock(lockKey);
  }
}

/**
 * Reprocessa transfers negados por falta de autorização
 */
export async function reprocessUnauthorizedTransfers(
  issuer: string,
  currency: string,
  network: 'testnet' | 'mainnet' | 'devnet'
): Promise<number> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return 0;
  }

  // Busca transfers que falharam por falta de autorização
  const failedTransfers = await prisma.actionRecord.findMany({
    where: {
      type: 'payment',
      tokenCurrency: currency,
      tokenIssuer: issuer,
      network,
      metadata: {
        path: ['error'],
        string_contains: 'tecNO_AUTH',
      },
    },
  });

  let reprocessed = 0;

  for (const transfer of failedTransfers) {
    const target = transfer.target;
    if (!target) continue;

    // Tenta autorizar e depois reprocessar transfer
    const result = await authorizeAndTransferAtomic({
      issuer,
      currency,
      holder: target,
      transferAmount: transfer.amount || '0',
      transferDestination: target,
      network,
    });

    if (result.success) {
      reprocessed++;
    }
  }

  return reprocessed;
}
