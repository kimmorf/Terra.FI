'use client';

import { getCrossmarkSDK } from './sdk';
import type { MPTokenMetadata } from './types';
import { xrpToDrops, isValidXRPAmount } from '../utils/xrp-converter';

export interface MPTokenIssuanceParams {
  issuer: string;
  currency: string;
  amount: string;
  decimals: number;
  transferable?: boolean;
  metadata?: MPTokenMetadata;
}

export interface MPTokenAuthorizeParams {
  issuer: string;
  currency: string;
  holder: string;
  authorize: boolean;
}

export interface MPTokenFreezeParams {
  issuer: string;
  currency: string;
  holder: string;
  freeze: boolean;
}

export interface MPTokenClawbackParams {
  issuer: string;
  currency: string;
  holder: string;
  amount: string;
}

export interface MPTPaymentParams {
  sender: string;
  destination: string;
  amount: string;
  currency: string;
  issuer: string;
  memo?: string;
}

export interface TrustSetParams {
  account: string;
  currency: string;
  issuer: string;
  limit?: string;
  flags?: number;
}

export function extractTransactionHash(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;

  const obj = response as Record<string, any>;
  return (
    obj?.data?.hash ??
    obj?.data?.result?.hash ??
    obj?.data?.result?.tx_json?.hash ??
    obj?.data?.tx_json?.hash ??
    obj?.result?.hash ??
    null
  );
}

function stringToHex(input: string): string {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(input))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function buildMetadataMemo(metadata: MPTokenMetadata) {
  const json = JSON.stringify(metadata);
  return {
    Memo: {
      MemoType: stringToHex('XLS-89'),
      MemoData: stringToHex(json),
    },
  };
}

export function buildMPTokenIssuanceTransaction({
  issuer,
  currency,
  amount,
  decimals,
  transferable = true,
  metadata,
}: MPTokenIssuanceParams) {
  const transaction: Record<string, unknown> = {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: issuer,
    Currency: currency.toUpperCase(),
    Amount: amount,
    Decimals: decimals,
    Transferable: transferable,
  };

  if (metadata) {
    transaction.Memos = [buildMetadataMemo(metadata)];
  }

  return transaction;
}

export function buildMPTokenAuthorizeTransaction({
  issuer,
  currency,
  holder,
  authorize,
}: MPTokenAuthorizeParams) {
  return {
    TransactionType: 'MPTokenAuthorize',
    Account: issuer,
    Currency: currency.toUpperCase(),
    Holder: holder,
    Authorize: authorize,
  };
}

export function buildMPTokenFreezeTransaction({
  issuer,
  currency,
  holder,
  freeze,
}: MPTokenFreezeParams) {
  return {
    TransactionType: 'MPTokenFreeze',
    Account: issuer,
    Currency: currency.toUpperCase(),
    Holder: holder,
    Freeze: freeze,
  };
}

export function buildMPTokenClawbackTransaction({
  issuer,
  currency,
  holder,
  amount,
}: MPTokenClawbackParams) {
  return {
    TransactionType: 'MPTokenClawback',
    Account: issuer,
    Currency: currency.toUpperCase(),
    Holder: holder,
    Amount: amount,
  };
}

export function buildPaymentTransaction({
  sender,
  destination,
  amount,
  currency,
  issuer,
  memo,
}: MPTPaymentParams) {
  const transaction: Record<string, unknown> = {
    TransactionType: 'Payment',
    Account: sender,
    Destination: destination,
    Amount: {
      currency: currency.toUpperCase(),
      issuer,
      value: amount,
    },
  };

  if (memo) {
    transaction.Memos = [
      {
        Memo: {
          MemoType: stringToHex('NOTE'),
          MemoData: stringToHex(memo),
        },
      },
    ];
  }

  return transaction;
}

// Interface para pagamento em XRP nativo
export interface XRPPaymentParams {
  sender: string;
  destination: string;
  amount: string; // Em XRP como string (será convertido para drops)
  memo?: string;
}

// Função para construir transação de pagamento em XRP nativo
export function buildXRPPaymentTransaction({
  sender,
  destination,
  amount,
  memo,
}: XRPPaymentParams) {
  // Validar valor
  if (!isValidXRPAmount(amount)) {
    throw new Error('Valor XRP inválido');
  }

  // Converter com precisão
  const amountInDrops = xrpToDrops(amount);

  // Construir transação no formato correto para XRPL
  const transaction: Record<string, unknown> = {
    TransactionType: 'Payment',
    Account: sender,
    Destination: destination,
    Amount: amountInDrops, // XRP nativo é enviado como string de drops
  };

  // Adicionar memo se fornecido
  if (memo) {
    transaction.Memos = [
      {
        Memo: {
          MemoType: stringToHex('NOTE'),
          MemoData: stringToHex(memo),
        },
      },
    ];
  }

  // Garantir que TransactionType está presente
  if (!transaction.TransactionType) {
    throw new Error('Erro ao construir transação: TransactionType não definido');
  }

  return transaction;
}

// Função para enviar pagamento em XRP nativo
export function sendXRPPayment(params: XRPPaymentParams) {
  const transaction = buildXRPPaymentTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function buildTrustSetTransaction({
  account,
  currency,
  issuer,
  limit = '1000000000',
  flags,
}: TrustSetParams) {
  const transaction: Record<string, unknown> = {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: {
      currency: currency.toUpperCase(),
      issuer,
      value: limit,
    },
  };

  if (typeof flags === 'number') {
    transaction.Flags = flags;
  }

  return transaction;
}

export async function signAndSubmitTransaction(
  transaction: Record<string, unknown>,
  options?: {
    network?: string;
    validate?: boolean;
    timeout?: number;
  }
) {
  const sdk = getCrossmarkSDK();
  if (!sdk) {
    throw new Error('Crossmark SDK indisponível. Certifique-se de que a extensão está carregada.');
  }

  // Garantir que a transação tem TransactionType
  if (!transaction.TransactionType) {
    throw new Error('Transação deve ter TransactionType definido');
  }

  // Validar transação se solicitado (padrão: false para evitar problemas)
  if (options?.validate === true) {
    const { validateTransaction } = await import('./validation');
    const validation = await validateTransaction(
      transaction,
      (options?.network as any) ?? 'testnet'
    );

    if (!validation.valid) {
      throw new Error(
        `Transação inválida: ${validation.errors.join(', ')}`
      );
    }

    if (validation.warnings.length > 0) {
      console.warn('[Crossmark] Avisos de validação:', validation.warnings);
    }
  }

  if (!sdk.async.signAndSubmitAndWait) {
    throw new Error('A versão atual da Crossmark não suporta signAndSubmitAndWait.');
  }

  // Garantir que estamos passando a transação corretamente
  // Crossmark espera tx_json com a transação completa
  // Criar uma cópia limpa da transação para evitar problemas de referência
  const txJson: Record<string, unknown> = {};
  
  // Copiar todos os campos da transação
  for (const key in transaction) {
    if (transaction.hasOwnProperty(key)) {
      txJson[key] = transaction[key];
    }
  }

  // Garantir que TransactionType está presente e é uma string
  if (!txJson.TransactionType || typeof txJson.TransactionType !== 'string') {
    console.error('[Crossmark] Transação inválida:', transaction);
    throw new Error(`TransactionType deve ser uma string. Recebido: ${typeof txJson.TransactionType}`);
  }

  console.log('[Crossmark] Enviando transação:', {
    TransactionType: txJson.TransactionType,
    Account: txJson.Account,
    Destination: txJson.Destination,
    Amount: txJson.Amount,
    hasMemos: !!txJson.Memos,
  });

  // Verificar se a transação está no formato correto antes de enviar
  if (!txJson.Account) {
    throw new Error('Transação deve ter Account definido');
  }

  try {
    const response = await sdk.async.signAndSubmitAndWait({
      tx_json: txJson,
      autofill: true, // Crossmark faz autofill automaticamente
      failHard: false, // Mudar para false para não falhar rápido demais
      timeout: options?.timeout ?? 60000,
    });

    if (!response) {
      throw new Error('Não foi possível obter a resposta da Crossmark.');
    }

    // Verificar status da transação
    const status = (response as any)?.data?.result?.engine_result;
    if (status && !status.startsWith('tes')) {
      throw new Error(`Transação falhou: ${status}`);
    }

    return response;
  } catch (error: any) {
    // Log detalhado do erro para debug
    console.error('[Crossmark] Erro ao enviar transação:', {
      error: error.message,
      transaction: {
        TransactionType: txJson.TransactionType,
        Account: txJson.Account,
        Destination: txJson.Destination,
      },
    });
    throw error;
  }
}

export function authorizeMPToken(params: MPTokenAuthorizeParams) {
  const transaction = buildMPTokenAuthorizeTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function freezeMPToken(params: MPTokenFreezeParams) {
  const transaction = buildMPTokenFreezeTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function clawbackMPToken(params: MPTokenClawbackParams) {
  const transaction = buildMPTokenClawbackTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function sendMPToken(params: MPTPaymentParams) {
  const transaction = buildPaymentTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function trustSetToken(params: TrustSetParams) {
  const transaction = buildTrustSetTransaction(params);
  return signAndSubmitTransaction(transaction);
}

