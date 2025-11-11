/**
 * Verificação de confirmação de transações XRPL
 */

import { xrplPool, type XRPLNetwork } from './pool';
import { validateTransactionHash } from '../crossmark/validation';
import { withXRPLRetry } from '../utils/retry';

export interface TransactionVerificationResult {
  confirmed: boolean;
  status: string | null;
  ledgerIndex: number | null;
  error?: string;
}

/**
 * Verifica se uma transação foi confirmada na blockchain
 */
export async function verifyTransaction(
  txHash: string,
  network: XRPLNetwork = 'testnet',
  maxAttempts: number = 10
): Promise<TransactionVerificationResult> {
  // Validar hash
  if (!validateTransactionHash(txHash)) {
    return {
      confirmed: false,
      status: null,
      ledgerIndex: null,
      error: 'Hash de transação inválido',
    };
  }

  // Tentar múltiplas vezes (transação pode ainda não estar no ledger)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await withXRPLRetry(async () => {
        const client = await xrplPool.getClient(network);
        const response = await client.request({
          command: 'tx',
          transaction: txHash,
        });
        return response.result;
      }, { maxAttempts: 2 });

      // Verificar se foi validado
      const validated = result.validated ?? false;
      const status = result.meta?.TransactionResult;

      if (validated && status === 'tesSUCCESS') {
        return {
          confirmed: true,
          status,
          ledgerIndex: result.ledger_index ?? null,
        };
      }

      if (validated && status) {
        // Transação foi validada mas falhou
        return {
          confirmed: true,
          status,
          ledgerIndex: result.ledger_index ?? null,
          error: `Transação falhou: ${status}`,
        };
      }

      // Se não foi validado ainda, aguarda um pouco e tenta novamente
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s
      }
    } catch (error: any) {
      // Se erro é "txnNotFound", transação ainda não está no ledger
      if (error?.data?.error === 'txnNotFound' && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      return {
        confirmed: false,
        status: null,
        ledgerIndex: null,
        error: error?.message || 'Erro ao verificar transação',
      };
    }
  }

  return {
    confirmed: false,
    status: null,
    ledgerIndex: null,
    error: 'Transação não encontrada após múltiplas tentativas',
  };
}

/**
 * Aguarda confirmação de uma transação
 */
export async function waitForConfirmation(
  txHash: string,
  network: XRPLNetwork = 'testnet',
  timeout: number = 60000 // 60s
): Promise<TransactionVerificationResult> {
  const startTime = Date.now();
  const maxAttempts = Math.floor(timeout / 2000); // Tentativas a cada 2s

  while (Date.now() - startTime < timeout) {
    const result = await verifyTransaction(txHash, network, 1);
    
    if (result.confirmed) {
      return result;
    }

    // Aguarda 2s antes de tentar novamente
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return {
    confirmed: false,
    status: null,
    ledgerIndex: null,
    error: 'Timeout aguardando confirmação',
  };
}
