/**
 * Reliable submission de transações XRPL com retry e validação
 */

import { xrplPool, type XRPLNetwork } from './pool';
import { withXRPLRetry } from '../utils/retry';

export interface SubmissionResult {
  elapsedMs: number;
  result: {
    tx_json?: {
      hash?: string;
    };
    meta?: {
      TransactionResult?: string;
    };
  };
}

export class ReliableSubmission {
  constructor(private readonly network: XRPLNetwork = 'testnet') {}

  async submitAndWait(txBlob: string, maxMs = 20000): Promise<SubmissionResult> {
    const start = Date.now();

    const result = await withXRPLRetry(
      async () => {
        const client = await xrplPool.getClient(this.network);
        
        // Usa submitAndWait do XRPL se disponível
        if (typeof (client as any).submitAndWait === 'function') {
          const response = await (client as any).submitAndWait(txBlob);
          return response.result;
        }

        // Fallback: submit manual e aguarda
        const response = await client.request({
          command: 'submit',
          tx_blob: txBlob,
        });

        // Se não foi validado imediatamente, aguarda
        if (response.result.engine_result === 'tesSUCCESS' && !response.result.validated) {
          // Aguarda validação
          const txHash = response.result.tx_json?.hash;
          if (txHash) {
            return await this.waitForValidation(txHash, maxMs - (Date.now() - start));
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
