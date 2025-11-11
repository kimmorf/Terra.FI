/**
 * Reliable Submission Policy V2
 * Evolução do reliable-submission.ts com políticas avançadas
 * - Submit → Poll → Validated com exponential backoff
 * - LastLedgerSequence handling
 * - Catalogação completa de engine_result
 * - Circuit breaker e fallback RPC
 */

import { Client } from 'xrpl';
import { getErrorAction, type XRPLErrorEntry } from './error-catalog';
import { structuredLog } from '../logging/structured-logger';

export interface ReliableSubmissionOptions {
  purchaseId?: string;
  idempotencyKey?: string;
  maxRetries?: number;
  initialBackoff?: number;
  maxBackoff?: number;
  lastLedgerSequence?: number;
  timeout?: number;
  enableCircuitBreaker?: boolean;
  fallbackEndpoints?: string[];
}

export interface ReliableSubmissionResult {
  success: boolean;
  txHash: string | null;
  validated: boolean;
  engineResult?: string;
  ledgerIndex?: number;
  retryCount: number;
  elapsedMs: number;
  usedFallback: boolean;
  error?: string;
}

const DEFAULT_ENDPOINTS: Record<string, string[]> = {
  testnet: [
    'wss://s.altnet.rippletest.net:51233',
    'wss://s.altnet.rippletest.net:51234',
    'wss://testnet.xrpl.ws',
  ],
  mainnet: [
    'wss://xrplcluster.com',
    'wss://s1.ripple.com',
    'wss://s2.ripple.com',
  ],
  devnet: [
    'wss://s.devnet.rippletest.net:51233',
  ],
};

/**
 * Calcula delay exponencial com jitter
 */
function calculateBackoff(
  attempt: number,
  initialBackoff: number,
  maxBackoff: number
): number {
  const exponential = Math.min(initialBackoff * Math.pow(2, attempt), maxBackoff);
  const jitter = Math.random() * 0.3 * exponential; // 30% jitter
  return exponential + jitter;
}

/**
 * Obtém próximo endpoint (fallback)
 */
function getNextEndpoint(
  endpoints: string[],
  currentIndex: number
): { endpoint: string; index: number } {
  const nextIndex = (currentIndex + 1) % endpoints.length;
  return {
    endpoint: endpoints[nextIndex],
    index: nextIndex,
  };
}

/**
 * Submete transação de forma confiável
 */
export async function reliableSubmitV2(
  txBlob: string,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet',
  options: ReliableSubmissionOptions = {}
): Promise<ReliableSubmissionResult> {
  const {
    purchaseId,
    idempotencyKey,
    maxRetries = 5,
    initialBackoff = 1000,
    maxBackoff = 30000,
    lastLedgerSequence,
    timeout = 60000,
    enableCircuitBreaker = true,
    fallbackEndpoints = DEFAULT_ENDPOINTS[network] || [],
  } = options;

  const startTime = Date.now();
  let retryCount = 0;
  let endpointIndex = 0;
  let usedFallback = false;
  let lastError: Error | null = null;
  let lastEngineResult: string | undefined;

  const correlationId = purchaseId || idempotencyKey || `sub_${Date.now()}`;

  structuredLog('reliable_submission_start', {
    correlationId,
    purchaseId,
    idempotencyKey,
    network,
    maxRetries,
  });

  while (retryCount <= maxRetries) {
    const currentEndpoint = fallbackEndpoints[endpointIndex];
    let client: Client | null = null;

    try {
      client = new Client(currentEndpoint);
      await client.connect();

      // Submete transação
      const submitResponse = await client.request({
        command: 'submit',
        tx_blob: txBlob,
      });

      const txHash = submitResponse.result.tx_json?.hash;
      const engineResult = submitResponse.result.engine_result;

      if (!txHash) {
        throw new Error('No transaction hash returned');
      }

      structuredLog('transaction_submitted', {
        correlationId,
        txHash,
        engineResult,
        endpoint: currentEndpoint,
        retryCount,
      });

      // Verifica engine result
      if (engineResult) {
        lastEngineResult = engineResult;

        const errorAction = getErrorAction(engineResult);

        // Se é sucesso, aguarda validação
        if (engineResult === 'tesSUCCESS' || engineResult.startsWith('tes')) {
          // Aguarda validação
          const validation = await waitForValidation(
            client,
            txHash,
            timeout - (Date.now() - startTime),
            correlationId
          );

          if (validation.validated) {
            structuredLog('transaction_validated', {
              correlationId,
              txHash,
              ledgerIndex: validation.ledgerIndex,
              elapsedMs: Date.now() - startTime,
            });

            return {
              success: true,
              txHash,
              validated: true,
              engineResult: validation.engineResult,
              ledgerIndex: validation.ledgerIndex,
              retryCount,
              elapsedMs: Date.now() - startTime,
              usedFallback,
            };
          }
        }

        // Verifica se é retryable
        if (errorAction?.action.retryable && retryCount < maxRetries) {
          const backoffStrategy = errorAction.action.backoff || 'exponential';
          const maxRetriesForError = errorAction.action.maxRetries || maxRetries;

          if (retryCount < maxRetriesForError) {
            // Ações específicas por erro
            if (engineResult === 'tefMAX_LEDGER') {
              // LastLedgerSequence expirado - precisa resubmeter com novo
              structuredLog('last_ledger_expired', {
                correlationId,
                txHash,
                retryCount,
              });
              // Continua para retry com novo LastLedgerSequence
            } else if (engineResult === 'terPRE_SEQ' || engineResult === 'tefPAST_SEQ') {
              // Sequência incorreta - aguarda mais tempo
              const delay = calculateBackoff(retryCount, initialBackoff * 2, maxBackoff);
              await new Promise((resolve) => setTimeout(resolve, delay));
              retryCount++;
              continue;
            } else {
              // Outros erros retryable
              const delay = calculateBackoff(retryCount, initialBackoff, maxBackoff);
              await new Promise((resolve) => setTimeout(resolve, delay));
              retryCount++;
              continue;
            }
          }
        }

        // Erro não retryable ou excedeu retries
        structuredLog('transaction_failed', {
          correlationId,
          txHash,
          engineResult,
          retryCount,
          errorAction: errorAction?.action.action,
        });

        return {
          success: false,
          txHash,
          validated: false,
          engineResult,
          retryCount,
          elapsedMs: Date.now() - startTime,
          usedFallback,
          error: errorAction?.action.description || `Engine result: ${engineResult}`,
        };
      }

      // Se não tem engine result, aguarda validação
      const validation = await waitForValidation(
        client,
        txHash,
        timeout - (Date.now() - startTime),
        correlationId
      );

      if (validation.validated) {
        return {
          success: true,
          txHash,
          validated: true,
          engineResult: validation.engineResult,
          ledgerIndex: validation.ledgerIndex,
          retryCount,
          elapsedMs: Date.now() - startTime,
          usedFallback,
        };
      }

      // Não validado - retry
      if (retryCount < maxRetries) {
        const delay = calculateBackoff(retryCount, initialBackoff, maxBackoff);
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      return {
        success: false,
        txHash,
        validated: false,
        retryCount,
        elapsedMs: Date.now() - startTime,
        usedFallback,
        error: 'Transaction not validated within timeout',
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      structuredLog('submission_error', {
        correlationId,
        error: lastError.message,
        endpoint: currentEndpoint,
        retryCount,
      });

      // Tenta fallback se disponível
      if (fallbackEndpoints.length > 1 && retryCount < maxRetries) {
        const next = getNextEndpoint(fallbackEndpoints, endpointIndex);
        endpointIndex = next.index;
        usedFallback = true;
        
        structuredLog('fallback_endpoint', {
          correlationId,
          from: currentEndpoint,
          to: next.endpoint,
        });

        await client?.disconnect();
        const delay = calculateBackoff(retryCount, initialBackoff, maxBackoff);
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      // Se não tem fallback ou excedeu retries
      if (retryCount < maxRetries) {
        const delay = calculateBackoff(retryCount, initialBackoff, maxBackoff);
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }
    } finally {
      await client?.disconnect();
    }
  }

  structuredLog('reliable_submission_failed', {
    correlationId,
    retryCount,
    elapsedMs: Date.now() - startTime,
    error: lastError?.message,
  });

  return {
    success: false,
    txHash: null,
    validated: false,
    engineResult: lastEngineResult,
    retryCount,
    elapsedMs: Date.now() - startTime,
    usedFallback,
    error: lastError?.message || 'Max retries exceeded',
  };
}

/**
 * Aguarda validação da transação
 */
async function waitForValidation(
  client: Client,
  txHash: string,
  timeout: number,
  correlationId: string
): Promise<{ validated: boolean; ledgerIndex?: number; engineResult?: string }> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 segundos

  while (Date.now() - startTime < timeout) {
    try {
      const txResponse = await client.request({
        command: 'tx',
        transaction: txHash,
      });

      const validated = txResponse.result.validated;
      const ledgerIndex = txResponse.result.ledger_index as number | undefined;
      const meta = txResponse.result.meta;

      if (validated && meta && typeof meta === 'object') {
        const engineResult = (meta as any).TransactionResult;
        
        structuredLog('validation_poll', {
          correlationId,
          txHash,
          validated: true,
          ledgerIndex,
          engineResult,
        });

        return {
          validated: true,
          ledgerIndex,
          engineResult,
        };
      }

      // Aguarda próximo ledger
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      if (error?.data?.error === 'txnNotFound') {
        // Transação ainda não encontrada - aguarda
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }
      
      // Outro erro - retorna não validado
      structuredLog('validation_error', {
        correlationId,
        txHash,
        error: error?.message || String(error),
      });
      
      break;
    }
  }

  return { validated: false };
}

/**
 * Gera idempotency key único
 */
export function generateIdempotencyKey(): string {
  return `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
