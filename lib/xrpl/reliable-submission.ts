/**
 * Reliable Submission Guardrails
 * Implementa retries, idempotency, e polling até validação
 */

import { getCrossmarkSDK } from '../crossmark/sdk';
import { extractTransactionHash } from '../crossmark/transactions';
import {
  getErrorAction,
  isRetryableError,
  getBackoffStrategy,
  getMaxRetries,
} from './error-catalog';
import { Client } from 'xrpl';

export interface SubmissionOptions {
  idempotencyKey?: string;
  maxRetries?: number;
  retryDelay?: number;
  lastLedgerSequence?: number;
  timeout?: number; // milliseconds
}

export interface SubmissionResult {
  success: boolean;
  txHash: string | null;
  engineResult?: string;
  validated: boolean;
  ledgerIndex?: number;
  error?: string;
  retryCount: number;
}

/**
 * Calcula delay exponencial para retry
 */
function calculateBackoffDelay(
  attempt: number,
  strategy: 'exponential' | 'linear' | 'fixed' = 'exponential',
  baseDelay: number = 1000
): number {
  switch (strategy) {
    case 'exponential':
      return baseDelay * Math.pow(2, attempt);
    case 'linear':
      return baseDelay * (attempt + 1);
    case 'fixed':
      return baseDelay;
  }
}

/**
 * Aguarda validação da transação na XRPL
 */
async function waitForValidation(
  txHash: string,
  network: 'testnet' | 'mainnet' | 'devnet',
  timeout: number = 60000
): Promise<{ validated: boolean; ledgerIndex?: number; engineResult?: string }> {
  const endpoint =
    network === 'testnet'
      ? 'wss://s.altnet.rippletest.net:51233'
      : network === 'mainnet'
      ? 'wss://xrplcluster.com'
      : 'wss://s.devnet.rippletest.net:51233';

  const client = new Client(endpoint);
  const startTime = Date.now();

  try {
    await client.connect();

    while (Date.now() - startTime < timeout) {
      try {
        const tx = await client.request({
          command: 'tx',
          transaction: txHash,
        });

        const meta = tx.result.meta;
        if (meta && typeof meta === 'object' && 'TransactionResult' in meta) {
          const engineResult = (meta as any).TransactionResult;
          const validated = tx.result.validated ?? false;
          const ledgerIndex = tx.result.ledger_index;

          if (validated) {
            return {
              validated: true,
              ledgerIndex: ledgerIndex as number | undefined,
              engineResult,
            };
          }

          // Se não validado mas temos resultado, verifica se é erro fatal
          if (engineResult && !isRetryableError(engineResult)) {
            return {
              validated: false,
              ledgerIndex: ledgerIndex as number | undefined,
              engineResult,
            };
          }
        }

        // Aguarda próximo ledger (3-5 segundos)
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error) {
        // Continua tentando
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return { validated: false };
  } finally {
    await client.disconnect();
  }
}

/**
 * Submete transação de forma confiável com retries e validação
 */
export async function reliableSubmit(
  transaction: Record<string, unknown>,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet',
  options: SubmissionOptions = {}
): Promise<SubmissionResult> {
  const {
    idempotencyKey,
    maxRetries = 5,
    retryDelay = 1000,
    lastLedgerSequence,
    timeout = 60000,
  } = options;

  let retryCount = 0;
  let lastError: Error | null = null;
  let lastEngineResult: string | undefined;

  // Adiciona idempotency key ao memo se fornecido
  if (idempotencyKey && transaction.Memos) {
    const memos = Array.isArray(transaction.Memos) ? transaction.Memos : [transaction.Memos];
    memos.push({
      Memo: {
        MemoType: 'idempotency_key',
        MemoData: idempotencyKey,
      },
    });
    transaction.Memos = memos;
  }

  // Adiciona LastLedgerSequence se fornecido
  if (lastLedgerSequence) {
    transaction.LastLedgerSequence = lastLedgerSequence;
  }

  while (retryCount <= maxRetries) {
    try {
      const sdk = getCrossmarkSDK();
      if (!sdk) {
        throw new Error('Crossmark SDK indisponível');
      }

      if (!sdk.async.signAndSubmitAndWait) {
        throw new Error('A versão atual da Crossmark não suporta signAndSubmitAndWait');
      }

      // Assina e submete
      const response = await sdk.async.signAndSubmitAndWait({
        tx_json: transaction,
        autofill: true,
        failHard: false,
      });

      if (!response) {
        throw new Error('Não foi possível obter a resposta da Crossmark');
      }

      // Extrai hash da transação
      const txHash = extractTransactionHash(response);
      if (!txHash) {
        throw new Error('Não foi possível identificar o hash da transação');
      }

      // Extrai engine result se disponível
      const responseError =
        (response as any)?.error ??
        (response as any)?.data?.error ??
        (response as any)?.result?.error;

      if (responseError) {
        const engineResult = responseError.engine_result || responseError.result;
        lastEngineResult = engineResult;

        // Verifica se é retryable
        if (engineResult && isRetryableError(engineResult)) {
          const errorAction = getErrorAction(engineResult);
          const backoffStrategy = errorAction?.action.backoff ?? 'exponential';
          const maxRetriesForError = errorAction?.action.maxRetries ?? maxRetries;

          if (retryCount < maxRetriesForError) {
            const delay = calculateBackoffDelay(retryCount, backoffStrategy, retryDelay);
            await new Promise((resolve) => setTimeout(resolve, delay));
            retryCount++;
            continue;
          }
        }

        // Erro não retryable ou excedeu retries
        return {
          success: false,
          txHash,
          engineResult,
          validated: false,
          error: responseError.message || `Engine result: ${engineResult}`,
          retryCount,
        };
      }

      // Aguarda validação
      const validation = await waitForValidation(txHash, network, timeout);

      if (validation.validated) {
        return {
          success: true,
          txHash,
          engineResult: validation.engineResult,
          validated: true,
          ledgerIndex: validation.ledgerIndex,
          retryCount,
        };
      }

      // Não validado mas pode ser retryable
      if (validation.engineResult && isRetryableError(validation.engineResult)) {
        const errorAction = getErrorAction(validation.engineResult);
        const backoffStrategy = errorAction?.action.backoff ?? 'exponential';
        const delay = calculateBackoffDelay(retryCount, backoffStrategy, retryDelay);

        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }
      }

      return {
        success: false,
        txHash,
        engineResult: validation.engineResult,
        validated: false,
        error: 'Transaction not validated within timeout',
        retryCount,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Verifica se é erro retryable
      if (retryCount < maxRetries) {
        const delay = calculateBackoffDelay(retryCount, 'exponential', retryDelay);
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      return {
        success: false,
        txHash: null,
        validated: false,
        error: lastError.message,
        retryCount,
      };
    }
  }

  return {
    success: false,
    txHash: null,
    engineResult: lastEngineResult,
    validated: false,
    error: lastError?.message || 'Max retries exceeded',
    retryCount,
  };
}

/**
 * Gera idempotency key único
 */
export function generateIdempotencyKey(): string {
  return `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
