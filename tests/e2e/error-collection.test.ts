/**
 * Testes E2E com coleta de erros
 * Executa testes e reporta erros encontrados em arquivos ERROR_<CATEGORIA>.MD
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, cleanupTestEnvironment, type TestEnvironment } from '../setup/testnet-setup';
import { reportError, quickErrorReport, type ErrorCategory } from '../utils/error-reporter';
import { xrplPool } from '@/lib/xrpl/pool';
import { Client, Wallet, convertStringToHex } from 'xrpl';
import { xrpToDrops } from '../utils/xrp-helpers';

describe('E2E: Coleta de Erros - Compra Primária LAND-MPT', () => {
  let env: TestEnvironment;
  let mptCurrency: string;
  let mptIssuer: string;
  const errors: string[] = [];

  beforeAll(async () => {
    try {
      env = await setupTestEnvironment();
      mptIssuer = env.issuer.address;
      mptCurrency = 'LAND';
      
      const client = await xrplPool.getClient('testnet');
      const wallet = Wallet.fromSeed(env.issuer.secret);

      // Emite MPT
      const issuanceTx = await client.autofill({
        TransactionType: 'MPTokenIssuanceCreate',
        Account: mptIssuer,
        Currency: mptCurrency,
        Amount: '1000000',
        Decimals: 6,
        Transferable: true,
      });

      const signed = wallet.sign(issuanceTx);
      const result = await client.submitAndWait(signed.tx_blob);
      
      if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
        throw new Error('Falha ao emitir MPT');
      }

      // Autoriza investidor A
      const authorizeA = await client.autofill({
        TransactionType: 'MPTokenAuthorize',
        Account: mptIssuer,
        Currency: mptCurrency,
        Holder: env.investorA.address,
        Authorize: true,
      });

      const signedA = wallet.sign(authorizeA);
      await client.submitAndWait(signedA.tx_blob);
    } catch (error: any) {
      errors.push(`Setup falhou: ${error.message}`);
      throw error;
    }
  }, 120000);

  afterAll(async () => {
    await cleanupTestEnvironment(env);
    
    // Reporta erros coletados
    if (errors.length > 0) {
      quickErrorReport(
        'TRANSFER',
        'Erros durante setup de compra primária',
        errors.join('; '),
        ['Executar setup de ambiente de testes'],
        undefined,
        'HIGH'
      );
    }
  });

  it('deve completar compra primária sem erros', async () => {
    const steps: string[] = [];
    let txHash: string | undefined;

    try {
      steps.push('1. Criar ordem de compra');
      const purchaseAmount = '50'; // XRP
      const purchaseId = `test_${Date.now()}`;
      
      steps.push('2. Enviar pagamento XRP');
      const client = await xrplPool.getClient('testnet');
      const investorWallet = Wallet.fromSeed(env.investorA.secret);

      const paymentTx = await client.autofill({
        TransactionType: 'Payment',
        Account: env.investorA.address,
        Destination: env.treasury.address,
        Amount: xrpToDrops(purchaseAmount),
        Memos: [
          {
            Memo: {
              MemoType: convertStringToHex('PURCHASE_ID'),
              MemoData: convertStringToHex(purchaseId),
            },
          },
        ],
      });

      const signedPayment = investorWallet.sign(paymentTx);
      const paymentResult = await client.submitAndWait(signedPayment.tx_blob);
      txHash = paymentResult.result.hash!;

      if (paymentResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
        const errorCode = paymentResult.result.meta?.TransactionResult;
        
        reportError({
          category: 'TRANSFER',
          title: 'Falha no pagamento XRP durante compra primária',
          severity: 'HIGH',
          description: `Transação de pagamento XRP falhou com código: ${errorCode}`,
          stepsToReproduce: steps,
          expectedBehavior: 'Pagamento XRP deve ser confirmado com tesSUCCESS',
          actualBehavior: `Transação retornou: ${errorCode}`,
          txHash,
          consoleLogs: [`Payment failed: ${errorCode}`],
          backendLogs: [`Transaction result: ${JSON.stringify(paymentResult.result)}`],
          environment: {
            network: 'testnet',
            timestamp: new Date().toISOString(),
          },
        });

        throw new Error(`Pagamento falhou: ${errorCode}`);
      }

      steps.push('3. Verificar recebimento de MPT');
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verifica trustline
      const hasTrust = await client.request({
        command: 'account_lines',
        account: env.investorA.address,
        peer: mptIssuer,
        ledger_index: 'validated',
      });

      const hasTrustLine = (hasTrust.result.lines ?? []).some(
        (line: any) => line.currency === mptCurrency && line.account === mptIssuer
      );

      if (!hasTrustLine) {
        // Tenta criar trustline
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
        const trustResult = await client.submitAndWait(signedTrust.tx_blob);
        
        if (trustResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
          reportError({
            category: 'TRANSFER',
            title: 'Falha ao criar trustline para receber MPT',
            severity: 'HIGH',
            description: `TrustSet falhou: ${trustResult.result.meta?.TransactionResult}`,
            stepsToReproduce: [...steps, '4. Criar trustline para MPT'],
            expectedBehavior: 'Trustline deve ser criada com sucesso',
            actualBehavior: `TrustSet retornou: ${trustResult.result.meta?.TransactionResult}`,
            txHash: trustResult.result.hash,
            environment: {
              network: 'testnet',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      expect(paymentResult.result.meta?.TransactionResult).toBe('tesSUCCESS');
    } catch (error: any) {
      if (!txHash) {
        // Erro antes de enviar transação
        reportError({
          category: 'TRANSFER',
          title: 'Erro ao preparar compra primária',
          severity: 'MEDIUM',
          description: error.message,
          stepsToReproduce: steps,
          expectedBehavior: 'Compra deve ser preparada sem erros',
          actualBehavior: error.message,
          consoleLogs: [error.stack],
          environment: {
            network: 'testnet',
            timestamp: new Date().toISOString(),
          },
        });
      }
      throw error;
    }
  }, 180000);
});

describe('E2E: Coleta de Erros - DEX OfferCreate', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  }, 120000);

  afterAll(async () => {
    await cleanupTestEnvironment(env);
  });

  it('deve criar e cancelar oferta no DEX', async () => {
    const steps: string[] = [];
    let offerTxHash: string | undefined;
    let cancelTxHash: string | undefined;

    try {
      // Setup: precisa ter tokens para vender
      steps.push('1. Verificar saldo de tokens');
      
      const client = await xrplPool.getClient('testnet');
      
      steps.push('2. Criar oferta de venda (OfferCreate)');
      const investorWallet = Wallet.fromSeed(env.investorA.secret);
      
      // Tenta criar oferta (pode falhar se não tiver tokens)
      const offerTx = await client.autofill({
        TransactionType: 'OfferCreate',
        Account: env.investorA.address,
        TakerGets: {
          currency: 'USD',
          issuer: env.treasury.address,
          value: '100',
        },
        TakerPays: '1000000', // 1 XRP em drops
      });

      const signedOffer = investorWallet.sign(offerTx);
      const offerResult = await client.submitAndWait(signedOffer.tx_blob);
      offerTxHash = offerResult.result.hash!;

      if (offerResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
        const errorCode = offerResult.result.meta?.TransactionResult;
        
        reportError({
          category: 'TRANSFER',
          title: 'Falha ao criar oferta no DEX',
          severity: 'MEDIUM',
          description: `OfferCreate falhou: ${errorCode}`,
          stepsToReproduce: steps,
          expectedBehavior: 'Oferta deve ser criada com sucesso no DEX',
          actualBehavior: `OfferCreate retornou: ${errorCode}`,
          txHash: offerTxHash,
          environment: {
            network: 'testnet',
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        steps.push('3. Cancelar oferta');
        // Busca sequência da oferta
        const accountOffers = await client.request({
          command: 'account_offers',
          account: env.investorA.address,
          ledger_index: 'validated',
        });

        const offers = accountOffers.result.offers || [];
        if (offers.length > 0) {
          const offerSequence = offers[0].seq;
          
          const cancelTx = await client.autofill({
            TransactionType: 'OfferCancel',
            Account: env.investorA.address,
            OfferSequence: offerSequence,
          });

          const signedCancel = investorWallet.sign(cancelTx);
          const cancelResult = await client.submitAndWait(signedCancel.tx_blob);
          cancelTxHash = cancelResult.result.hash!;

          if (cancelResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
            reportError({
              category: 'TRANSFER',
              title: 'Falha ao cancelar oferta no DEX',
              severity: 'MEDIUM',
              description: `OfferCancel falhou: ${cancelResult.result.meta?.TransactionResult}`,
              stepsToReproduce: [...steps, `4. Cancelar oferta ${offerSequence}`],
              expectedBehavior: 'Oferta deve ser cancelada com sucesso',
              actualBehavior: `OfferCancel retornou: ${cancelResult.result.meta?.TransactionResult}`,
              txHash: cancelTxHash,
              environment: {
                network: 'testnet',
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      }
    } catch (error: any) {
      reportError({
        category: 'TRANSFER',
        title: 'Erro durante operações DEX',
        severity: 'MEDIUM',
        description: error.message,
        stepsToReproduce: steps,
        expectedBehavior: 'Operações DEX devem completar sem erros',
        actualBehavior: error.message,
        txHash: offerTxHash || cancelTxHash,
        consoleLogs: [error.stack],
        environment: {
          network: 'testnet',
          timestamp: new Date().toISOString(),
        },
      });
      throw error;
    }
  }, 180000);
});

describe('E2E: Coleta de Erros - Lock/Unlock COL-MPT', () => {
  let env: TestEnvironment;
  let mptCurrency: string;
  let mptIssuer: string;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    mptIssuer = env.issuer.address;
    mptCurrency = 'LAND';
  }, 120000);

  afterAll(async () => {
    await cleanupTestEnvironment(env);
  });

  it('deve congelar tokens e emitir COL-MPT', async () => {
    const steps: string[] = [];
    let freezeTxHash: string | undefined;

    try {
      steps.push('1. Verificar saldo de tokens LAND');
      const client = await xrplPool.getClient('testnet');
      const issuerWallet = Wallet.fromSeed(env.issuer.secret);

      steps.push('2. Congelar tokens (Freeze)');
      const freezeTx = await client.autofill({
        TransactionType: 'MPTokenFreeze',
        Account: mptIssuer,
        Currency: mptCurrency,
        Holder: env.investorA.address,
        Freeze: true,
      });

      const signedFreeze = issuerWallet.sign(freezeTx);
      const freezeResult = await client.submitAndWait(signedFreeze.tx_blob);
      freezeTxHash = freezeResult.result.hash!;

      if (freezeResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
        const errorCode = freezeResult.result.meta?.TransactionResult;
        
        reportError({
          category: 'LOCK',
          title: 'Falha ao congelar tokens para colateralização',
          severity: 'HIGH',
          description: `MPTokenFreeze falhou: ${errorCode}`,
          stepsToReproduce: steps,
          expectedBehavior: 'Tokens devem ser congelados com sucesso',
          actualBehavior: `MPTokenFreeze retornou: ${errorCode}`,
          txHash: freezeTxHash,
          environment: {
            network: 'testnet',
            timestamp: new Date().toISOString(),
          },
        });

        throw new Error(`Freeze falhou: ${errorCode}`);
      }

      steps.push('3. Emitir COL-MPT representando colateral');
      // Emite COL-MPT (simulado - na prática seria emitido após freeze)
      const colCurrency = 'COL';
      const colIssuanceTx = await client.autofill({
        TransactionType: 'MPTokenIssuanceCreate',
        Account: mptIssuer,
        Currency: colCurrency,
        Amount: '1000',
        Decimals: 6,
        Transferable: true,
      });

      const signedCol = issuerWallet.sign(colIssuanceTx);
      const colResult = await client.submitAndWait(signedCol.tx_blob);

      if (colResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
        reportError({
          category: 'LOCK',
          title: 'Falha ao emitir COL-MPT após freeze',
          severity: 'HIGH',
          description: `MPTokenIssuanceCreate para COL falhou: ${colResult.result.meta?.TransactionResult}`,
          stepsToReproduce: [...steps, '4. Emitir COL-MPT'],
          expectedBehavior: 'COL-MPT deve ser emitido após freeze',
          actualBehavior: `Emissão retornou: ${colResult.result.meta?.TransactionResult}`,
          txHash: colResult.result.hash,
          environment: {
            network: 'testnet',
            timestamp: new Date().toISOString(),
          },
        });
      }

      steps.push('4. Descongelar tokens (Unfreeze)');
      const unfreezeTx = await client.autofill({
        TransactionType: 'MPTokenFreeze',
        Account: mptIssuer,
        Currency: mptCurrency,
        Holder: env.investorA.address,
        Freeze: false,
      });

      const signedUnfreeze = issuerWallet.sign(unfreezeTx);
      const unfreezeResult = await client.submitAndWait(signedUnfreeze.tx_blob);

      if (unfreezeResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
        reportError({
          category: 'LOCK',
          title: 'Falha ao descongelar tokens',
          severity: 'HIGH',
          description: `MPTokenFreeze (unfreeze) falhou: ${unfreezeResult.result.meta?.TransactionResult}`,
          stepsToReproduce: [...steps, '5. Executar unfreeze'],
          expectedBehavior: 'Tokens devem ser descongelados com sucesso',
          actualBehavior: `Unfreeze retornou: ${unfreezeResult.result.meta?.TransactionResult}`,
          txHash: unfreezeResult.result.hash,
          environment: {
            network: 'testnet',
            timestamp: new Date().toISOString(),
          },
        });
      }

      expect(freezeResult.result.meta?.TransactionResult).toBe('tesSUCCESS');
    } catch (error: any) {
      if (!freezeTxHash) {
        reportError({
          category: 'LOCK',
          title: 'Erro durante processo de lock/unlock',
          severity: 'HIGH',
          description: error.message,
          stepsToReproduce: steps,
          expectedBehavior: 'Processo de lock/unlock deve completar sem erros',
          actualBehavior: error.message,
          consoleLogs: [error.stack],
          environment: {
            network: 'testnet',
            timestamp: new Date().toISOString(),
          },
        });
      }
      throw error;
    }
  }, 180000);
});
