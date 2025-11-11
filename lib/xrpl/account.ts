// Utilitários para consultar informações de conta na XRPL

import { isValidAddress } from 'xrpl';
import { xrplPool, type XRPLNetwork } from './pool';
import { withXRPLRetry } from '../utils/retry';
import { cache } from '../utils/cache';
import { dropsToXrp } from '../utils/xrp-converter';

/**
 * Obter informações de uma conta na XRPL
 */
export async function getAccountInfo(address: string, network: XRPLNetwork = 'testnet') {
  // Validar endereço
  if (!isValidAddress(address)) {
    throw new Error('Endereço XRPL inválido');
  }

  const cacheKey = `account_info:${network}:${address}`;
  
  // Tentar cache primeiro (TTL: 5 segundos)
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Buscar do XRPL
  const result = await withXRPLRetry(async () => {
    const client = await xrplPool.getClient(network);
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    return response.result;
  }, { maxAttempts: 3, initialDelay: 1000 });

  // Cachear por 5 segundos
  cache.set(cacheKey, result, 5000);

  return result;
}

/**
 * Obter tokens MPT de uma conta
 */
export async function getAccountMPTokens(address: string, network: XRPLNetwork = 'testnet') {
  if (!isValidAddress(address)) {
    throw new Error('Endereço XRPL inválido');
  }

  const cacheKey = `account_mpt:${network}:${address}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await withXRPLRetry(async () => {
    const client = await xrplPool.getClient(network);
    const accountLines = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    });

    return (
      accountLines.result.lines?.filter((line: any) => line.currency !== 'XRP') ?? []
    );
  }, { maxAttempts: 3 });

  // Cachear por 10 segundos
  cache.set(cacheKey, result, 10000);

  return result;
}

/**
 * Obter saldo XRP de uma conta
 */
export async function getXRPBalance(address: string, network: XRPLNetwork = 'testnet') {
  if (!isValidAddress(address)) {
    throw new Error('Endereço XRPL inválido');
  }

  const cacheKey = `xrp_balance:${network}:${address}`;
  const cached = cache.get<number>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const result = await withXRPLRetry(async () => {
    const client = await xrplPool.getClient(network);
    const accountInfo = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });

    const balanceDrops = accountInfo.result.account_data.Balance;
    // Usar conversão precisa
    return parseFloat(dropsToXrp(balanceDrops));
  }, { maxAttempts: 3 });

  // Cachear por 5 segundos
  cache.set(cacheKey, result, 5000);

  return result;
}

