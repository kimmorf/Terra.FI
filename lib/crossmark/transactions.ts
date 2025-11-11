'use client';

import { getCrossmarkSDK } from './sdk';
import type { MPTokenMetadata } from './types';

export interface MPTokenIssuanceParams {
  issuer: string;
  currency: string;
  amount: string;
  decimals: number;
  transferable?: boolean;
  metadata?: MPTokenMetadata;
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

export async function signAndSubmitTransaction(transaction: Record<string, unknown>) {
  const sdk = getCrossmarkSDK();
  if (!sdk) {
    throw new Error('Crossmark SDK indisponível. Certifique-se de que a extensão está carregada.');
  }

  if (!sdk.async.signAndSubmitAndWait) {
    throw new Error('A versão atual da Crossmark não suporta signAndSubmitAndWait.');
  }

  const response = await sdk.async.signAndSubmitAndWait({
    tx_json: transaction,
    autofill: true,
    failHard: false,
  });

  if (!response) {
    throw new Error('Não foi possível obter a resposta da Crossmark.');
  }

  return response;
}

