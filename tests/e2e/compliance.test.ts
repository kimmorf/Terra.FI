/**
 * Testes de Compliance: RequireAuth, Freeze, Clawback
 * 
 * Valida que os controles de compliance do XRPL estão realmente operantes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, Wallet, convertStringToHex } from 'xrpl';
import { setupTestEnvironment, cleanupTestEnvironment, type TestEnvironment } from '../setup/testnet-setup';
import {
  waitForTransactionWithMetrics,
  getTokenBalance,
  hasTrustLine,
  generateTestReport,
  formatReport,
} from '../utils/test-helpers';
import { xrpToDrops } from '../utils/xrp-helpers';
import { xrplPool } from '@/lib/xrpl/pool';

describe('Compliance: RequireAuth, Freeze, Clawback', () => {
  let env: TestEnvironment;
  let mptCurrency: string;
  let mptIssuer: string;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    mptIssuer = env.issuer.address;
    mptCurrency = 'COMPLIANCE_TEST';
    
    const client = await xrplPool.getClient('testnet');
    const wallet = Wallet.fromSeed(env.issuer.secret);

    // Emite MPT com RequireAuth
    const issuanceTx = await client.autofill({
      TransactionType: 'MPTokenIssuanceCreate',
      Account: mptIssuer,
      Currency: mptCurrency,
      Amount: '1000000',
      Decimals: 6,
      Transferable: true,
      Flags: 0x00010000, // RequireAuth
    });

    const signed = wallet.sign(issuanceTx);
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
      throw new Error('Falha ao emitir MPT com RequireAuth');
    }

    console.log(`[Setup] MPT com RequireAuth emitido: ${mptCurrency}`);
  }, 120000);

  afterAll(async () => {
    await cleanupTestEnvironment(env);
  });

  describe('RequireAuth', () => {
    it('deve bloquear transferência sem autorização', async () => {
      const steps: string[] = [];
      const metrics: any[] = [];
      const errors: string[] = [];

      try {
        const client = await xrplPool.getClient('testnet');
        const issuerWallet = Wallet.fromSeed(env.issuer.secret);
        const investorWallet = Wallet.fromSeed(env.investorA.secret);

        // 1. Emite tokens para issuer
        steps.push('1. Emitindo tokens para issuer');
        const issueTx = await client.autofill({
          TransactionType: 'Payment',
          Account: mptIssuer,
          Destination: mptIssuer,
          Amount: {
            currency: mptCurrency,
            issuer: mptIssuer,
            value: '1000',
          },
        });

        const signedIssue = issuerWallet.sign(issueTx);
        const issueResult = await client.submitAndWait(signedIssue.tx_blob);
        metrics.push(await waitForTransactionWithMetrics(issueResult.result.hash!, 'testnet'));

        // 2. Tenta transferir para investorA SEM autorizar (deve falhar)
        steps.push('2. Tentando transferir sem autorização (deve falhar)');
        
        // Cria trustline primeiro
        const trustSetTx = await client.autofill({
          TransactionType: 'TrustSet',
          Account: env.investorA.address,
          LimitAmount: {
            currency: mptCurrency,
            issuer: mptIssuer,
            value: '1000000',
          },
        });

        const signedTrust = investorWallet.sign(trustSetTx);
        await client.submitAndWait(signedTrust.tx_blob);

        // Tenta transferir (deve falhar)
        const transferTx = await client.autofill({
          TransactionType: 'Payment',
          Account: mptIssuer,
          Destination: env.investorA.address,
          Amount: {
            currency: mptCurrency,
            issuer: mptIssuer,
            value: '100',
          },
        });

        const signedTransfer = issuerWallet.sign(transferTx);
        const transferResult = await client.submitAndWait(signedTransfer.tx_blob);
        
        const failed = transferResult.result.meta?.TransactionResult !== 'tesSUCCESS';
        steps.push(`3. Transferência ${failed ? 'BLOQUEADA' : 'PERMITIDA'} (esperado: BLOQUEADA)`);
        
        if (!failed) {
          errors.push('Transferência foi permitida sem autorização!');
        }

        const report = generateTestReport(
          'RequireAuth',
          'Bloqueio de transferência sem autorização',
          failed,
          metrics,
          steps,
          errors
        );

        console.log(formatReport(report));

        expect(failed).toBe(true);
      } catch (error: any) {
        errors.push(error.message);
        throw error;
      }
    }, 180000);

    it('deve permitir transferência após autorização', async () => {
      const steps: string[] = [];
      const metrics: any[] = [];
      const errors: string[] = [];

      try {
        const client = await xrplPool.getClient('testnet');
        const issuerWallet = Wallet.fromSeed(env.issuer.secret);
        const investorWallet = Wallet.fromSeed(env.investorA.secret);

        // 1. Autoriza investorA
        steps.push('1. Autorizando investorA');
        const authorizeTx = await client.autofill({
          TransactionType: 'MPTokenAuthorize',
          Account: mptIssuer,
          Currency: mptCurrency,
          Holder: env.investorA.address,
          Authorize: true,
        });

        const signedAuth = issuerWallet.sign(authorizeTx);
        const authResult = await client.submitAndWait(signedAuth.tx_blob);
        metrics.push(await waitForTransactionWithMetrics(authResult.result.hash!, 'testnet'));
        steps.push(`   TX Hash: ${authResult.result.hash}`);

        // 2. Transfere tokens (deve funcionar agora)
        steps.push('2. Transferindo tokens (deve funcionar)');
        const transferTx = await client.autofill({
          TransactionType: 'Payment',
          Account: mptIssuer,
          Destination: env.investorA.address,
          Amount: {
            currency: mptCurrency,
            issuer: mptIssuer,
            value: '100',
          },
        });

        const signedTransfer = issuerWallet.sign(transferTx);
        const transferResult = await client.submitAndWait(signedTransfer.tx_blob);
        metrics.push(await waitForTransactionWithMetrics(transferResult.result.hash!, 'testnet'));
        steps.push(`   TX Hash: ${transferResult.result.hash}`);

        const success = transferResult.result.meta?.TransactionResult === 'tesSUCCESS';
        steps.push(`3. Transferência ${success ? 'PERMITIDA' : 'BLOQUEADA'} (esperado: PERMITIDA)`);

        // 3. Verifica saldo
        if (success) {
          const balance = await getTokenBalance(
            env.investorA.address,
            mptCurrency,
            mptIssuer,
            'testnet'
          );
          steps.push(`4. Saldo recebido: ${balance}`);
        }

        const report = generateTestReport(
          'RequireAuth - Após Autorização',
          'Transferência permitida após autorização',
          success,
          metrics,
          steps,
          errors
        );

        console.log(formatReport(report));

        expect(success).toBe(true);
      } catch (error: any) {
        errors.push(error.message);
        throw error;
      }
    }, 180000);
  });

  describe('Freeze', () => {
    it('deve congelar tokens de um holder', async () => {
      const steps: string[] = [];
      const metrics: any[] = [];
      const errors: string[] = [];

      try {
        const client = await xrplPool.getClient('testnet');
        const issuerWallet = Wallet.fromSeed(env.issuer.secret);

        // 1. Verifica saldo antes
        const balanceBefore = await getTokenBalance(
          env.investorA.address,
          mptCurrency,
          mptIssuer,
          'testnet'
        );
        steps.push(`1. Saldo antes do freeze: ${balanceBefore}`);

        // 2. Congela tokens
        steps.push('2. Congelando tokens do investorA');
        const freezeTx = await client.autofill({
          TransactionType: 'MPTokenFreeze',
          Account: mptIssuer,
          Currency: mptCurrency,
          Holder: env.investorA.address,
          Freeze: true,
        });

        const signedFreeze = issuerWallet.sign(freezeTx);
        const freezeResult = await client.submitAndWait(signedFreeze.tx_blob);
        metrics.push(await waitForTransactionWithMetrics(freezeResult.result.hash!, 'testnet'));
        steps.push(`   TX Hash: ${freezeResult.result.hash}`);

        const frozen = freezeResult.result.meta?.TransactionResult === 'tesSUCCESS';
        steps.push(`3. Freeze ${frozen ? 'APLICADO' : 'FALHOU'} (esperado: APLICADO)`);

        // 3. Tenta transferir tokens congelados (deve falhar)
        if (frozen) {
          steps.push('4. Tentando transferir tokens congelados (deve falhar)');
          const investorWallet = Wallet.fromSeed(env.investorA.secret);
          
          const transferTx = await client.autofill({
            TransactionType: 'Payment',
            Account: env.investorA.address,
            Destination: env.investorB.address,
            Amount: {
              currency: mptCurrency,
              issuer: mptIssuer,
              value: '10',
            },
          });

          const signedTransfer = investorWallet.sign(transferTx);
          const transferResult = await client.submitAndWait(signedTransfer.tx_blob);
          
          const blocked = transferResult.result.meta?.TransactionResult !== 'tesSUCCESS';
          steps.push(`5. Transferência ${blocked ? 'BLOQUEADA' : 'PERMITIDA'} (esperado: BLOQUEADA)`);
          
          if (!blocked) {
            errors.push('Transferência de tokens congelados foi permitida!');
          }
        }

        const report = generateTestReport(
          'Freeze',
          'Congelamento de tokens e bloqueio de transferência',
          frozen,
          metrics,
          steps,
          errors
        );

        console.log(formatReport(report));

        expect(frozen).toBe(true);
      } catch (error: any) {
        errors.push(error.message);
        throw error;
      }
    }, 180000);

    it('deve descongelar tokens', async () => {
      const steps: string[] = [];
      const metrics: any[] = [];
      const errors: string[] = [];

      try {
        const client = await xrplPool.getClient('testnet');
        const issuerWallet = Wallet.fromSeed(env.issuer.secret);

        // 1. Descongela tokens
        steps.push('1. Descongelando tokens do investorA');
        const unfreezeTx = await client.autofill({
          TransactionType: 'MPTokenFreeze',
          Account: mptIssuer,
          Currency: mptCurrency,
          Holder: env.investorA.address,
          Freeze: false,
        });

        const signedUnfreeze = issuerWallet.sign(unfreezeTx);
        const unfreezeResult = await client.submitAndWait(signedUnfreeze.tx_blob);
        metrics.push(await waitForTransactionWithMetrics(unfreezeResult.result.hash!, 'testnet'));
        steps.push(`   TX Hash: ${unfreezeResult.result.hash}`);

        const unfrozen = unfreezeResult.result.meta?.TransactionResult === 'tesSUCCESS';
        steps.push(`2. Unfreeze ${unfrozen ? 'APLICADO' : 'FALHOU'} (esperado: APLICADO)`);

        // 2. Tenta transferir (deve funcionar agora)
        if (unfrozen) {
          steps.push('3. Tentando transferir após unfreeze (deve funcionar)');
          const investorWallet = Wallet.fromSeed(env.investorA.secret);
          
          const transferTx = await client.autofill({
            TransactionType: 'Payment',
            Account: env.investorA.address,
            Destination: env.investorB.address,
            Amount: {
              currency: mptCurrency,
              issuer: mptIssuer,
              value: '10',
            },
          });

          const signedTransfer = investorWallet.sign(transferTx);
          const transferResult = await client.submitAndWait(signedTransfer.tx_blob);
          metrics.push(await waitForTransactionWithMetrics(transferResult.result.hash!, 'testnet'));
          
          const success = transferResult.result.meta?.TransactionResult === 'tesSUCCESS';
          steps.push(`4. Transferência ${success ? 'PERMITIDA' : 'BLOQUEADA'} (esperado: PERMITIDA)`);
        }

        const report = generateTestReport(
          'Unfreeze',
          'Descongelamento de tokens e permissão de transferência',
          unfrozen,
          metrics,
          steps,
          errors
        );

        console.log(formatReport(report));

        expect(unfrozen).toBe(true);
      } catch (error: any) {
        errors.push(error.message);
        throw error;
      }
    }, 180000);
  });

  describe('Clawback', () => {
    it('deve recuperar tokens via clawback', async () => {
      const steps: string[] = [];
      const metrics: any[] = [];
      const errors: string[] = [];

      try {
        const client = await xrplPool.getClient('testnet');
        const issuerWallet = Wallet.fromSeed(env.issuer.secret);

        // 1. Verifica saldo antes
        const balanceBefore = await getTokenBalance(
          env.investorA.address,
          mptCurrency,
          mptIssuer,
          'testnet'
        );
        steps.push(`1. Saldo antes do clawback: ${balanceBefore}`);

        const clawbackAmount = '50';

        // 2. Executa clawback
        steps.push(`2. Executando clawback de ${clawbackAmount} tokens`);
        const clawbackTx = await client.autofill({
          TransactionType: 'MPTokenClawback',
          Account: mptIssuer,
          Currency: mptCurrency,
          Holder: env.investorA.address,
          Amount: clawbackAmount,
        });

        const signedClawback = issuerWallet.sign(clawbackTx);
        const clawbackResult = await client.submitAndWait(signedClawback.tx_blob);
        metrics.push(await waitForTransactionWithMetrics(clawbackResult.result.hash!, 'testnet'));
        steps.push(`   TX Hash: ${clawbackResult.result.hash}`);

        const success = clawbackResult.result.meta?.TransactionResult === 'tesSUCCESS';
        steps.push(`3. Clawback ${success ? 'EXECUTADO' : 'FALHOU'} (esperado: EXECUTADO)`);

        // 3. Verifica saldo após
        if (success) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const balanceAfter = await getTokenBalance(
            env.investorA.address,
            mptCurrency,
            mptIssuer,
            'testnet'
          );
          steps.push(`4. Saldo após clawback: ${balanceAfter}`);
          
          const expectedBalance = parseFloat(balanceBefore) - parseFloat(clawbackAmount);
          const correct = Math.abs(parseFloat(balanceAfter) - expectedBalance) < 0.000001;
          steps.push(`5. Saldo correto: ${correct ? 'SIM' : 'NÃO'} (esperado: ${expectedBalance})`);
          
          if (!correct) {
            errors.push(`Saldo incorreto após clawback. Esperado: ${expectedBalance}, Obtido: ${balanceAfter}`);
          }
        }

        const report = generateTestReport(
          'Clawback',
          'Recuperação de tokens via clawback',
          success,
          metrics,
          steps,
          errors
        );

        console.log(formatReport(report));

        expect(success).toBe(true);
      } catch (error: any) {
        errors.push(error.message);
        throw error;
      }
    }, 180000);
  });
});
