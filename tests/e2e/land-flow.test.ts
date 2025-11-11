/**
 * E2E Test: LAND Flow
 * Testa: issue → authorize → buy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTrustline,
  type TestEnvironment,
} from '../setup/xrpl-test-env';
import { Client, Wallet } from 'xrpl';
import { reliableSubmit, generateIdempotencyKey } from '../../lib/xrpl/reliable-submission';
import {
  buildMPTokenIssuanceTransaction,
  buildMPTokenAuthorizeTransaction,
  buildPaymentTransaction,
} from '../../lib/crossmark/transactions';

describe('LAND Flow E2E', () => {
  let env: TestEnvironment;
  let landCurrency: string;
  let landTxHash: string | null = null;
  let authorizeTxHash: string | null = null;
  let buyTxHash: string | null = null;

  beforeAll(async () => {
    env = await setupTestEnvironment('testnet');
    landCurrency = 'LAND';
  }, 60000);

  afterAll(async () => {
    await cleanupTestEnvironment(env);
  });

  it('should issue LAND-MPT token', async () => {
    const idempotencyKey = generateIdempotencyKey();
    
    const issuanceTx = buildMPTokenIssuanceTransaction({
      issuer: env.issuer.address,
      currency: landCurrency,
      amount: '1000000', // 10,000.00 LAND (2 decimals)
      decimals: 2,
      transferable: true,
      metadata: {
        name: 'LAND-MPT Test',
        description: 'Test LAND token',
        purpose: 'E2E testing',
      },
    });

    const result = await reliableSubmit(issuanceTx, env.network, {
      idempotencyKey,
      maxRetries: 3,
    });

    expect(result.success).toBe(true);
    expect(result.txHash).toBeTruthy();
    expect(result.validated).toBe(true);

    landTxHash = result.txHash!;
  }, 60000);

  it('should authorize holder to receive LAND', async () => {
    if (!landTxHash) {
      throw new Error('LAND not issued in previous test');
    }

    const idempotencyKey = generateIdempotencyKey();

    const authorizeTx = buildMPTokenAuthorizeTransaction({
      issuer: env.issuer.address,
      currency: landCurrency,
      holder: env.holder1.address,
      authorize: true,
    });

    const result = await reliableSubmit(authorizeTx, env.network, {
      idempotencyKey,
      maxRetries: 3,
    });

    expect(result.success).toBe(true);
    expect(result.txHash).toBeTruthy();
    expect(result.validated).toBe(true);

    authorizeTxHash = result.txHash!;
  }, 60000);

  it('should create trustline for holder', async () => {
    await createTrustline(
      env.client,
      env.holder1.wallet,
      landCurrency,
      env.issuer.address,
      '1000000'
    );
  }, 60000);

  it('should allow holder to buy LAND', async () => {
    if (!authorizeTxHash) {
      throw new Error('Holder not authorized in previous test');
    }

    const idempotencyKey = generateIdempotencyKey();
    const buyAmount = '10000'; // 100.00 LAND

    const paymentTx = buildPaymentTransaction({
      sender: env.issuer.address,
      destination: env.holder1.address,
      amount: buyAmount,
      currency: landCurrency,
      issuer: env.issuer.address,
      memo: `E2E test purchase: ${idempotencyKey}`,
    });

    const result = await reliableSubmit(paymentTx, env.network, {
      idempotencyKey,
      maxRetries: 3,
    });

    expect(result.success).toBe(true);
    expect(result.txHash).toBeTruthy();
    expect(result.validated).toBe(true);

    buyTxHash = result.txHash!;

    // Verifica saldo do holder
    const accountLines = await env.client.request({
      command: 'account_lines',
      account: env.holder1.address,
      ledger_index: 'validated',
    });

    const landLine = accountLines.result.lines?.find(
      (line: any) => line.currency === landCurrency && line.account === env.issuer.address
    );

    expect(landLine).toBeTruthy();
    expect(parseFloat(landLine.balance)).toBeGreaterThanOrEqual(parseFloat(buyAmount) / 100);
  }, 60000);

  it('should verify all transactions are validated', async () => {
    const txHashes = [landTxHash, authorizeTxHash, buyTxHash].filter(Boolean);

    for (const txHash of txHashes) {
      const tx = await env.client.request({
        command: 'tx',
        transaction: txHash!,
      });

      expect(tx.result.validated).toBe(true);
      expect(tx.result.meta?.TransactionResult).toBe('tesSUCCESS');
    }
  }, 60000);
});
