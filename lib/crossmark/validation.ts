/**
 * Validação de transações XRPL antes de enviar
 */

import { Client, validate, isValidAddress } from 'xrpl';
import { xrplPool, type XRPLNetwork } from '../xrpl/pool';
import { ValidationError } from '../errors/xrpl-errors';

// Helper para validar endereço XRPL (usa função do xrpl)
function isValidXRPLAddress(address: string): boolean {
  return isValidAddress(address);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida uma transação antes de enviar
 */
export async function validateTransaction(
  transaction: Record<string, unknown>,
  network: XRPLNetwork = 'testnet'
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validar campos obrigatórios
  if (!transaction.TransactionType) {
    errors.push('TransactionType é obrigatório');
  }

  if (!transaction.Account) {
    errors.push('Account é obrigatório');
  } else if (typeof transaction.Account === 'string') {
    if (!isValidXRPLAddress(transaction.Account)) {
      errors.push('Account não é um endereço XRPL válido');
    }
  }

  // Validar tipos específicos de transação
  switch (transaction.TransactionType) {
    case 'MPTokenIssuanceCreate':
      if (!transaction.Currency) {
        errors.push('Currency é obrigatório para MPTokenIssuanceCreate');
      }
      if (!transaction.Amount) {
        errors.push('Amount é obrigatório');
      }
      if (typeof transaction.Decimals !== 'number') {
        errors.push('Decimals deve ser um número');
      }
      break;

    case 'Payment':
      if (!transaction.Destination) {
        errors.push('Destination é obrigatório para Payment');
      } else if (typeof transaction.Destination === 'string') {
        if (!isValidXRPLAddress(transaction.Destination)) {
          errors.push('Destination não é um endereço XRPL válido');
        }
      }
      // Validar Amount
      if (transaction.Amount) {
        if (typeof transaction.Amount === 'string') {
          // XRP nativo em drops
          const drops = parseInt(transaction.Amount, 10);
          if (isNaN(drops) || drops <= 0) {
            errors.push('Amount deve ser um número positivo em drops');
          }
        } else if (typeof transaction.Amount === 'object') {
          // Token não-XRP
          const amount = transaction.Amount as any;
          if (!amount.currency || !amount.issuer || !amount.value) {
            errors.push('Amount de token deve ter currency, issuer e value');
          }
        }
      }
      break;

    case 'TrustSet':
      if (!transaction.LimitAmount) {
        errors.push('LimitAmount é obrigatório para TrustSet');
      }
      break;

    case 'MPTokenAuthorize':
      if (!transaction.Currency) {
        errors.push('Currency é obrigatório para MPTokenAuthorize');
      }
      if (!transaction.Holder) {
        errors.push('Holder é obrigatório para MPTokenAuthorize');
      } else if (typeof transaction.Holder === 'string') {
        if (!isValidXRPLAddress(transaction.Holder)) {
          errors.push('Holder não é um endereço XRPL válido');
        }
      }
      break;

    case 'MPTokenFreeze':
      if (!transaction.Currency) {
        errors.push('Currency é obrigatório para MPTokenFreeze');
      }
      if (!transaction.Holder) {
        errors.push('Holder é obrigatório para MPTokenFreeze');
      } else if (typeof transaction.Holder === 'string') {
        if (!isValidXRPLAddress(transaction.Holder)) {
          errors.push('Holder não é um endereço XRPL válido');
        }
      }
      break;

    case 'MPTokenClawback':
      if (!transaction.Currency) {
        errors.push('Currency é obrigatório para MPTokenClawback');
      }
      if (!transaction.Holder) {
        errors.push('Holder é obrigatório para MPTokenClawback');
      } else if (typeof transaction.Holder === 'string') {
        if (!isValidXRPLAddress(transaction.Holder)) {
          errors.push('Holder não é um endereço XRPL válido');
        }
      }
      if (!transaction.Amount) {
        errors.push('Amount é obrigatório para MPTokenClawback');
      }
      break;
  }

  // Se há erros críticos, não tenta validar no XRPL
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Validar usando cliente XRPL (opcional, pode falhar silenciosamente)
  try {
    const client = await xrplPool.getClient(network);

    try {
      // Preparar transação (autofill) - isso valida automaticamente
      // Se autofill passar, transação é válida (autofill lança erro se inválida)
      await client.autofill(transaction as any);
    } catch (error: any) {
      // Se autofill falhar, pode ser porque a transação ainda não está completa
      // Isso é OK, apenas adiciona warning
      warnings.push(
        `Não foi possível validar completamente no XRPL: ${error?.message || 'Erro desconhecido'}`
      );
    }
  } catch (error: any) {
    warnings.push(
      `Não foi possível conectar ao XRPL para validação: ${error?.message || 'Erro desconhecido'}`
    );
    // Retorna válido se não há erros de validação básica
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Valida endereço XRPL
 */
export function validateAddress(address: string): boolean {
  return isValidXRPLAddress(address);
}

/**
 * Valida hash de transação (64 caracteres hexadecimais)
 */
export function validateTransactionHash(hash: string): boolean {
  return /^[A-F0-9]{64}$/i.test(hash);
}
