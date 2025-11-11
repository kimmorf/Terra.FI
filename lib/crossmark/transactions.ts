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

