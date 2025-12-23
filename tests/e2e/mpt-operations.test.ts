/**
 * E2E Test: MPT Operations
 * Testa: Emissão, Transferência e Compra de MPTs
 * 
 * Este teste verifica o fluxo completo de operações com MPTs:
 * 1. Emissão de um novo MPT
 * 2. Autorização de holder para receber o MPT
 * 3. Transferência de MPT entre contas
 * 4. Simulação de compra (payment)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTrustline,
  type TestEnvironment,
} from '../setup/xrpl-test-env';
import { Client, Wallet } from 'xrpl';
import { 
  reliableSubmit, 
  generateIdempotencyKey, 
  registerTestWallet 
} from '../../lib/xrpl/reliable-submission';
import {
  buildMPTokenIssuanceTransaction,
  buildMPTokenAuthorizeTransaction,
  buildPaymentTransaction,
} from '../../lib/crossmark/transactions';

describe('MPT Operations E2E', () => {
  let env: TestEnvironment;
  let mptCurrency: string;
  let issuanceTxHash: string | null = null;
  let authorizeTxHash: string | null = null;
  let transferTxHash: string | null = null;
  let purchaseTxHash: string | null = null;

  beforeAll(async () => {
    console.log('🚀 Iniciando ambiente de testes XRPL...');
    env = await setupTestEnvironment('devnet');
    mptCurrency = `MPT${Date.now().toString().slice(-4)}`; // Nome único
    
    // Registrar wallets para uso no reliableSubmit
    registerTestWallet(env.issuer.address, env.issuer.wallet);
    registerTestWallet(env.holder1.address, env.holder1.wallet);
    registerTestWallet(env.holder2.address, env.holder2.wallet);
    
    console.log(`✅ Ambiente pronto. Currency: ${mptCurrency}`);
    console.log(`   Issuer: ${env.issuer.address}`);
    console.log(`   Holder1: ${env.holder1.address}`);
    console.log(`   Holder2: ${env.holder2.address}`);
  }, 120000);

  afterAll(async () => {
    console.log('🧹 Limpando ambiente de testes...');
    await cleanupTestEnvironment(env);
  });

  describe('1. Emissão de MPT', () => {
    it('deve emitir um novo MPT com sucesso', async () => {
      const idempotencyKey = generateIdempotencyKey();
      
      console.log('📝 Emitindo MPT...');
      
      const issuanceTx = buildMPTokenIssuanceTransaction({
        issuer: env.issuer.address,
        currency: mptCurrency,
        amount: '10000000', // 100,000.00 (2 decimais)
        decimals: 2,
        transferable: true,
        metadata: {
          name: `Test MPT ${mptCurrency}`,
          description: 'Token de teste para verificação E2E',
          purpose: 'Teste automatizado de emissão MPT',
        },
      });

      const result = await reliableSubmit(issuanceTx, env.network, {
        idempotencyKey,
        maxRetries: 3,
      });

      console.log(`   TX Hash: ${result.txHash}`);
      console.log(`   Validated: ${result.validated}`);

      expect(result.success).toBe(true);
      expect(result.txHash).toBeTruthy();
      expect(result.validated).toBe(true);

      issuanceTxHash = result.txHash!;
    }, 60000);

    it('deve verificar que o MPT foi criado no ledger', async () => {
      if (!issuanceTxHash) {
        throw new Error('MPT não foi emitido no teste anterior');
      }

      const tx = await env.client.request({
        command: 'tx',
        transaction: issuanceTxHash,
      });

      expect(tx.result.validated).toBe(true);
      expect(tx.result.meta?.TransactionResult).toBe('tesSUCCESS');
      
      console.log(`✅ MPT verificado no ledger`);
    }, 30000);
  });

  describe('2. Autorização de Holder', () => {
    it('deve autorizar holder1 a receber o MPT', async () => {
      if (!issuanceTxHash) {
        throw new Error('MPT não foi emitido');
      }

      const idempotencyKey = generateIdempotencyKey();
      
      console.log('🔐 Autorizando holder1...');

      const authorizeTx = buildMPTokenAuthorizeTransaction({
        issuer: env.issuer.address,
        currency: mptCurrency,
        holder: env.holder1.address,
        authorize: true,
      });

      const result = await reliableSubmit(authorizeTx, env.network, {
        idempotencyKey,
        maxRetries: 3,
      });

      console.log(`   TX Hash: ${result.txHash}`);

      expect(result.success).toBe(true);
      expect(result.txHash).toBeTruthy();
      expect(result.validated).toBe(true);

      authorizeTxHash = result.txHash!;
    }, 60000);

    it('deve autorizar holder2 a receber o MPT', async () => {
      const idempotencyKey = generateIdempotencyKey();
      
      console.log('🔐 Autorizando holder2...');

      const authorizeTx = buildMPTokenAuthorizeTransaction({
        issuer: env.issuer.address,
        currency: mptCurrency,
        holder: env.holder2.address,
        authorize: true,
      });

      const result = await reliableSubmit(authorizeTx, env.network, {
        idempotencyKey,
        maxRetries: 3,
      });

      console.log(`   TX Hash: ${result.txHash}`);

      expect(result.success).toBe(true);
    }, 60000);

    it('deve criar trustline para holder1', async () => {
      console.log('🔗 Criando trustline para holder1...');
      
      await createTrustline(
        env.client,
        env.holder1.wallet,
        mptCurrency,
        env.issuer.address,
        '1000000000'
      );
      
      console.log('   ✅ Trustline criada');
    }, 60000);

    it('deve criar trustline para holder2', async () => {
      console.log('🔗 Criando trustline para holder2...');
      
      await createTrustline(
        env.client,
        env.holder2.wallet,
        mptCurrency,
        env.issuer.address,
        '1000000000'
      );
      
      console.log('   ✅ Trustline criada');
    }, 60000);
  });

  describe('3. Transferência de MPT (Issuer → Holder)', () => {
    it('deve transferir MPT do issuer para holder1', async () => {
      if (!authorizeTxHash) {
        throw new Error('Holder não foi autorizado');
      }

      const idempotencyKey = generateIdempotencyKey();
      const transferAmount = '100000'; // 1,000.00 MPT
      
      console.log(`💸 Transferindo ${transferAmount} para holder1...`);

      const paymentTx = buildPaymentTransaction({
        sender: env.issuer.address,
        destination: env.holder1.address,
        amount: transferAmount,
        currency: mptCurrency,
        issuer: env.issuer.address,
        memo: `Transfer E2E test: ${idempotencyKey}`,
      });

      const result = await reliableSubmit(paymentTx, env.network, {
        idempotencyKey,
        maxRetries: 3,
      });

      console.log(`   TX Hash: ${result.txHash}`);

      expect(result.success).toBe(true);
      expect(result.txHash).toBeTruthy();
      expect(result.validated).toBe(true);

      transferTxHash = result.txHash!;
    }, 60000);

    it('deve verificar saldo do holder1 após transferência', async () => {
      if (!transferTxHash) {
        throw new Error('Transferência não realizada');
      }

      console.log('🔍 Verificando saldo do holder1...');

      const accountLines = await env.client.request({
        command: 'account_lines',
        account: env.holder1.address,
        ledger_index: 'validated',
      });

      const mptLine = accountLines.result.lines?.find(
        (line: any) => 
          line.currency === mptCurrency && 
          line.account === env.issuer.address
      );

      expect(mptLine).toBeTruthy();
      console.log(`   Saldo: ${mptLine?.balance} ${mptCurrency}`);
      
      const balance = parseFloat(mptLine?.balance || '0');
      expect(balance).toBeGreaterThan(0);
    }, 30000);
  });

  describe('4. Compra/Venda de MPT (Holder → Holder)', () => {
    it('deve permitir holder1 enviar MPT para holder2 (simulando venda)', async () => {
      const idempotencyKey = generateIdempotencyKey();
      const saleAmount = '10000'; // 100.00 MPT
      
      console.log(`🛒 Simulando venda: holder1 → holder2 (${saleAmount})...`);

      // Primeiro, precisamos verificar se o holder1 tem saldo suficiente
      const accountLines = await env.client.request({
        command: 'account_lines',
        account: env.holder1.address,
        ledger_index: 'validated',
      });

      const mptLine = accountLines.result.lines?.find(
        (line: any) => 
          line.currency === mptCurrency && 
          line.account === env.issuer.address
      );

      const currentBalance = parseFloat(mptLine?.balance || '0');
      console.log(`   Saldo atual holder1: ${currentBalance}`);
      
      expect(currentBalance).toBeGreaterThan(0);

      // Criar payment do holder1 para holder2
      // Nota: Para IOUs, o sender precisa ter autofill com sua wallet
      const paymentTx = {
        TransactionType: 'Payment',
        Account: env.holder1.address,
        Destination: env.holder2.address,
        Amount: {
          currency: mptCurrency.toUpperCase(),
          issuer: env.issuer.address,
          value: (parseFloat(saleAmount) / 100).toString(), // Converter para valor correto
        },
      };

      const prepared = await env.client.autofill(paymentTx);
      const signed = env.holder1.wallet.sign(prepared);
      const result = await env.client.submitAndWait(signed.tx_blob);

      console.log(`   TX Hash: ${result.result.hash}`);
      console.log(`   Result: ${result.result.meta?.TransactionResult}`);

      expect(result.result.meta?.TransactionResult).toBe('tesSUCCESS');

      purchaseTxHash = result.result.hash;
    }, 60000);

    it('deve verificar saldo do holder2 após compra', async () => {
      if (!purchaseTxHash) {
        throw new Error('Compra não realizada');
      }

      console.log('🔍 Verificando saldo do holder2...');

      const accountLines = await env.client.request({
        command: 'account_lines',
        account: env.holder2.address,
        ledger_index: 'validated',
      });

      const mptLine = accountLines.result.lines?.find(
        (line: any) => 
          line.currency === mptCurrency && 
          line.account === env.issuer.address
      );

      expect(mptLine).toBeTruthy();
      console.log(`   Saldo holder2: ${mptLine?.balance} ${mptCurrency}`);
      
      const balance = parseFloat(mptLine?.balance || '0');
      expect(balance).toBeGreaterThan(0);
    }, 30000);
  });

  describe('5. Verificação Final', () => {
    it('deve ter todas as transações validadas no ledger', async () => {
      console.log('🔍 Verificando todas as transações...');
      
      const txHashes = [
        { name: 'Issuance', hash: issuanceTxHash },
        { name: 'Authorize', hash: authorizeTxHash },
        { name: 'Transfer', hash: transferTxHash },
        { name: 'Purchase', hash: purchaseTxHash },
      ].filter(t => t.hash);

      for (const { name, hash } of txHashes) {
        const tx = await env.client.request({
          command: 'tx',
          transaction: hash!,
        });

        console.log(`   ${name}: ${tx.result.meta?.TransactionResult}`);
        
        expect(tx.result.validated).toBe(true);
        expect(tx.result.meta?.TransactionResult).toBe('tesSUCCESS');
      }

      console.log('✅ Todas as transações validadas com sucesso!');
    }, 30000);

    it('deve imprimir resumo do teste', async () => {
      console.log('\n📊 RESUMO DO TESTE MPT:');
      console.log('─'.repeat(50));
      console.log(`Currency: ${mptCurrency}`);
      console.log(`Network: ${env.network}`);
      console.log(`Issuer: ${env.issuer.address}`);
      console.log(`Holder1: ${env.holder1.address}`);
      console.log(`Holder2: ${env.holder2.address}`);
      console.log('─'.repeat(50));
      console.log('Transações:');
      console.log(`  • Emissão: ${issuanceTxHash}`);
      console.log(`  • Autorização: ${authorizeTxHash}`);
      console.log(`  • Transferência: ${transferTxHash}`);
      console.log(`  • Compra: ${purchaseTxHash}`);
      console.log('─'.repeat(50));
      
      expect(true).toBe(true);
    });
  });
});

