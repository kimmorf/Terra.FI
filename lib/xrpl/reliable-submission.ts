/**
 * Reliable submission de transações XRPL com retry e validação
 */

import { Client, Wallet } from 'xrpl';
import { xrplPool, type XRPLNetwork } from './pool';
import { withXRPLRetry } from '../utils/retry';

export interface SubmissionResult {
  elapsedMs: number;
  result: {
    tx_json?: {
      hash?: string;
    };
    hash?: string;
    meta?: {
      TransactionResult?: string;
    };
    engine_result?: string;
    validated?: boolean;
  };
}

export class ReliableSubmission {
  constructor(private readonly network: XRPLNetwork = 'testnet') {}

  async submitAndWait(txBlob: string, maxMs = 20000): Promise<SubmissionResult> {
    const start = Date.now();

    const result = await withXRPLRetry(
      async () => {
        const client = await xrplPool.getClient(this.network);
        
        // xrpl.js v4+ tem submitAndWait que aguarda validação automaticamente
        // Segundo a documentação: https://js.xrpl.org/
        try {
          // Tenta usar submitAndWait do xrpl.js (método recomendado)
          if (typeof (client as any).submitAndWait === 'function') {
            const response = await (client as any).submitAndWait(txBlob, {
              timeoutMs: maxMs,
            });
            // submitAndWait retorna { result: { ... } }
            return response.result || response;
          }
        } catch (error: any) {
          // Se submitAndWait falhar, usa fallback manual
          console.warn('[ReliableSubmission] submitAndWait não disponível, usando fallback:', error.message);
        }

        // Fallback: submit manual e aguarda validação
        const response = await client.request({
          command: 'submit',
          tx_blob: txBlob,
        });

        // Se não foi validado imediatamente, aguarda
        if (response.result.engine_result === 'tesSUCCESS' && !response.result.validated) {
          // Aguarda validação
          const txHash = response.result.tx_json?.hash;
          if (txHash) {
            const remainingTime = maxMs - (Date.now() - start);
            if (remainingTime > 0) {
              return await this.waitForValidation(txHash, remainingTime);
            }
          }
        }

        return response.result;
      },
      { maxAttempts: 3, initialDelay: 1000 }
    );

    // Verifica resultado
    const transactionResult = result.meta?.TransactionResult || result.engine_result;
    if (transactionResult && !transactionResult.startsWith('tes')) {
      const code = transactionResult;
      throw new Error(`XRPL error: ${code}`);
    }

    return {
      elapsedMs: Date.now() - start,
      result: result as any,
    };
  }

  private async waitForValidation(txHash: string, timeoutMs: number): Promise<any> {
    const startTime = Date.now();
    const maxAttempts = Math.floor(timeoutMs / 2000); // Tentativas a cada 2s

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Timeout aguardando validação da transação');
      }

      try {
        const client = await xrplPool.getClient(this.network);
        const response = await client.request({
          command: 'tx',
          transaction: txHash,
        });

        if (response.result.validated) {
          return response.result;
        }

        // Aguarda antes de tentar novamente
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        if (error?.data?.error === 'txnNotFound' && attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Transação não foi validada dentro do timeout');
  }
}

/**
 * Gera idempotency key único
 */
export function generateIdempotencyKey(): string {
  return `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export interface ReliableSubmitOptions {
  idempotencyKey?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface ReliableSubmitResult {
  success: boolean;
  txHash: string | null;
  validated: boolean;
  error?: string;
  retryCount?: number;
}

const ENDPOINTS: Record<string, string[]> = {
  testnet: ['wss://s.altnet.rippletest.net:51233'],
  devnet: ['wss://s.devnet.rippletest.net:51233'],
  mainnet: ['wss://xrplcluster.com/', 'wss://s1.ripple.com/'],
};

/**
 * Submete transação de forma confiável
 * Usado para testes e operações que precisam de autofill + sign + submit
 */
export async function reliableSubmit(
  transaction: Record<string, unknown>,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet',
  options: ReliableSubmitOptions = {}
): Promise<ReliableSubmitResult> {
  const { idempotencyKey, maxRetries = 3, timeout = 60000 } = options;

  const endpoints = ENDPOINTS[network] || ENDPOINTS.testnet;
  let client: Client | null = null;
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount <= maxRetries) {
    try {
      const endpoint = endpoints[retryCount % endpoints.length];
      client = new Client(endpoint);
      await client.connect();

      // Preparar transação
      const prepared = await client.autofill(transaction);

      // Buscar wallet para assinar
      // Nota: Em testes, a transaction já deve ter Account preenchido
      // e o caller deve passar a wallet ou seed
      const senderAddress = prepared.Account;
      
      // Tentar buscar wallet do pool
      const walletFromPool = await getWalletForAddress(senderAddress, network);
      
      if (!walletFromPool) {
        throw new Error(`Wallet não encontrada para ${senderAddress}`);
      }

      // Assinar
      const signed = walletFromPool.sign(prepared);

      // Submeter e aguardar
      const result = await client.submitAndWait(signed.tx_blob);

      const txHash = result.result.hash;
      const validated = result.result.validated || false;
      const txResult = (result.result.meta as any)?.TransactionResult || 'unknown';

      await client.disconnect();

      if (txResult === 'tesSUCCESS') {
        return {
          success: true,
          txHash: txHash || null,
          validated,
          retryCount,
        };
      } else {
        return {
          success: false,
          txHash: txHash || null,
          validated,
          error: txResult,
          retryCount,
        };
      }
    } catch (error: any) {
      lastError = error;
      retryCount++;

      if (client) {
        try {
          await client.disconnect();
        } catch {}
      }

      if (retryCount <= maxRetries) {
        // Espera antes de retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  return {
    success: false,
    txHash: null,
    validated: false,
    error: lastError?.message || 'Max retries exceeded',
    retryCount,
  };
}

// Cache de wallets para testes
const testWallets: Map<string, Wallet> = new Map();

/**
 * Registra wallet para uso em testes
 */
export function registerTestWallet(address: string, wallet: Wallet): void {
  testWallets.set(address, wallet);
}

/**
 * Busca wallet por endereço
 */
async function getWalletForAddress(address: string, network: string): Promise<Wallet | null> {
  // Primeiro tenta do cache de testes
  if (testWallets.has(address)) {
    return testWallets.get(address)!;
  }

  // Se não encontrar, retorna null (caller precisa registrar)
  return null;
}
