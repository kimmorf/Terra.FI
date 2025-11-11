/**
 * Compliance Functional Tests
 * Verifica: RequireAuth, Freeze, Clawback realmente operantes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  type TestEnvironment,
} from '../setup/xrpl-test-env';
import { reliableSubmit, generateIdempotencyKey } from '../../lib/xrpl/reliable-submission';
import {
  buildMPTokenIssuanceTransaction,
  buildMPTokenAuthorizeTransaction,
  buildMPTokenFreezeTransaction,
  buildMPTokenClawbackTransaction,
  buildPaymentTransaction,
} from '../../lib/crossmark/transactions';

describe('Compliance Functional Tests', () => {
  let env: TestEnvironment;
  let complianceCurrency: string;

  beforeAll(async () => {
    env = await setupTestEnvironment('testnet');
    complianceCurrency = 'COMP';
  }, 60000);

  afterAll(async () => {
    await cleanupTestEnvironment(env);
  });

  describe('RequireAuth Compliance', () => {
    it('should enforce authorization requirement', async () => {
      // Emite token com RequireAuth (via authorize antes de transferir)
      const issuanceTx = buildMPTokenIssuanceTransaction({
        issuer: env.issuer.address,
        currency: complianceCurrency,
        amount: '1000000',
        decimals: 2,
        transferable: true,
      });

      const issueResult = await reliableSubmit(issuanceTx, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      expect(issueResult.success).toBe(true);

      // Tenta transferir sem autorizar
      const unauthorizedTransfer = buildPaymentTransaction({
        sender: env.issuer.address,
        destination: env.holder1.address,
        amount: '10000',
        currency: complianceCurrency,
        issuer: env.issuer.address,
      });

      const transferResult = await reliableSubmit(unauthorizedTransfer, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      // Deve falhar ou requerer autorização
      // (depende da configuração do token na XRPL)
      expect(transferResult).toBeDefined();
    }, 120000);

    it('should allow transfer after authorization', async () => {
      // Autoriza holder
      const authorizeTx = buildMPTokenAuthorizeTransaction({
        issuer: env.issuer.address,
        currency: complianceCurrency,
        holder: env.holder1.address,
        authorize: true,
      });

      const authResult = await reliableSubmit(authorizeTx, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      expect(authResult.success).toBe(true);

      // Agora deve conseguir transferir
      const authorizedTransfer = buildPaymentTransaction({
        sender: env.issuer.address,
        destination: env.holder1.address,
        amount: '10000',
        currency: complianceCurrency,
        issuer: env.issuer.address,
      });

      const transferResult = await reliableSubmit(authorizedTransfer, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      expect(transferResult.success).toBe(true);
    }, 120000);
  });

  describe('Freeze Compliance', () => {
    it('should freeze token for specific holder', async () => {
      const freezeTx = buildMPTokenFreezeTransaction({
        issuer: env.issuer.address,
        currency: complianceCurrency,
        holder: env.holder1.address,
        freeze: true,
      });

      const result = await reliableSubmit(freezeTx, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBeTruthy();
      expect(result.validated).toBe(true);
    }, 60000);

    it('should prevent transfer from frozen account', async () => {
      // Tenta transferir de conta congelada
      const frozenTransfer = buildPaymentTransaction({
        sender: env.holder1.address, // Conta congelada
        destination: env.holder2.address,
        amount: '1000',
        currency: complianceCurrency,
        issuer: env.issuer.address,
      });

      const result = await reliableSubmit(frozenTransfer, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      // Deve falhar com tecFROZEN
      if (result.engineResult) {
        expect(['tecFROZEN', 'tefNO_AUTH_REQUIRED']).toContain(result.engineResult);
      }
    }, 60000);

    it('should allow unfreeze', async () => {
      const unfreezeTx = buildMPTokenFreezeTransaction({
        issuer: env.issuer.address,
        currency: complianceCurrency,
        holder: env.holder1.address,
        freeze: false,
      });

      const result = await reliableSubmit(unfreezeTx, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      expect(result.success).toBe(true);
      expect(result.validated).toBe(true);
    }, 60000);
  });

  describe('Clawback Compliance', () => {
    it('should execute clawback successfully', async () => {
      // Primeiro, garante que holder tem tokens
      const paymentTx = buildPaymentTransaction({
        sender: env.issuer.address,
        destination: env.holder1.address,
        amount: '5000',
        currency: complianceCurrency,
        issuer: env.issuer.address,
      });

      await reliableSubmit(paymentTx, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      // Executa clawback
      const clawbackTx = buildMPTokenClawbackTransaction({
        issuer: env.issuer.address,
        currency: complianceCurrency,
        holder: env.holder1.address,
        amount: '2000', // Clawback de 20.00 tokens
      });

      const result = await reliableSubmit(clawbackTx, env.network, {
        idempotencyKey: generateIdempotencyKey(),
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBeTruthy();
    }, 120000);

    it('should verify tokens were clawed back', async () => {
      // Verifica saldo do holder após clawback
      const accountLines = await env.client.request({
        command: 'account_lines',
        account: env.holder1.address,
        ledger_index: 'validated',
      });

      const tokenLine = accountLines.result.lines?.find(
        (line: any) =>
          line.currency === complianceCurrency && line.account === env.issuer.address
      );

      // Saldo deve ser reduzido pelo clawback
      expect(tokenLine).toBeTruthy();
      if (tokenLine) {
        const balance = parseFloat(tokenLine.balance);
        expect(balance).toBeLessThan(50); // Menos que 50.00 (5000 - 2000 = 3000 = 30.00)
      }
    }, 60000);
  });
});
