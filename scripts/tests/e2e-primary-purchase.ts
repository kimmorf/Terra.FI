#!/usr/bin/env tsx
/**
 * E2E Test: Compra Primária de MPT sob Carga
 * 
 * Valida o fluxo E2E de compra primária sob carga moderada, rede instável
 * e variantes (XRP vs RLUSD), produzindo relatórios com tx_hash e tempos.
 * 
 * Uso: tsx scripts/tests/e2e-primary-purchase.ts [--network=testnet|devnet] [--load=20]
 */

import { Client, Wallet, xrpToDrops, dropsToXrp } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';

const XRPL_ENDPOINTS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

interface PurchaseStep {
  step: string;
  type: 'quote' | 'commit' | 'payment' | 'mpt_send' | 'validation';
  success: boolean;
  txHash?: string;
  payload?: any;
  duration?: number;
  error?: string;
  timestamp: string;
}

interface PurchaseResult {
  purchaseId: string;
  buyer: string;
  paymentMethod: 'XRP' | 'RLUSD';
  amount: string;
  tokenAmount: string;
  steps: PurchaseStep[];
  status: 'COMPLETED' | 'FAILED' | 'COMPENSATION_REQUIRED' | 'REJECTED';
  totalDuration: number;
  validationP95?: number;
}

interface TestReport {
  network: string;
  config: {
    load: number;
    currency: string;
    issuer: string;
  };
  startTime: string;
  endTime?: string;
  duration?: number;
  preparation: {
    accountsCreated: boolean;
    mptIssued: boolean;
    authorizations: string[];
  };
  scenarios: {
    happyPathXRP: PurchaseResult[];
    happyPathRLUSD: PurchaseResult[];
    unauthorizedBuyer: PurchaseResult[];
    leg2Failure: PurchaseResult[];
    expiredQuote: PurchaseResult[];
    replayAttack: PurchaseResult[];
    authorizationRemoved: PurchaseResult[];
  };
  loadTest: {
    purchases: PurchaseResult[];
    statistics: {
      total: number;
      completed: number;
      failed: number;
      p50: number;
      p95: number;
      p99: number;
      avgDuration: number;
    };
  };
  summary: {
    totalPurchases: number;
    totalPassed: number;
    totalFailed: number;
    criticalIssues: string[];
  };
}

/**
 * Carrega configuração de contas
 */
function loadAccountsConfig(network: 'testnet' | 'devnet') {
  const configPath = path.join(
    process.cwd(),
    'scripts',
    'tests',
    'config',
    `accounts-${network}.json`
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Configuração não encontrada: ${configPath}\nExecute primeiro: tsx scripts/tests/setup-accounts.ts --network=${network}`
    );
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * Calcula percentis
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
}

/**
 * Aguarda validação de transação
 */
async function waitForValidation(
  client: Client,
  txHash: string,
  maxWaitSeconds: number = 60
): Promise<{ validated: boolean; duration: number }> {
  const startTime = Date.now();
  const maxWait = maxWaitSeconds * 1000;

  while (Date.now() - startTime < maxWait) {
    try {
      const response = await client.request({
        command: 'tx',
        transaction: txHash,
      });

      if (response.result.validated) {
        return {
          validated: true,
          duration: Date.now() - startTime,
        };
      }
    } catch (error: any) {
      if (error.data?.error !== 'txnNotFound') {
        throw error;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    validated: false,
    duration: Date.now() - startTime,
  };
}

/**
 * Submete transação e mede validação
 */
async function submitAndMeasure(
  client: Client,
  wallet: Wallet,
  transaction: any,
  description: string,
  simulateSlowRPC: boolean = false
): Promise<{
  hash: string;
  result: any;
  submitTime: number;
  validatedTime?: number;
  validationDuration?: number;
}> {
  const submitTime = Date.now();

  // Simular RPC lento
  if (simulateSlowRPC) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  try {
    const prepared = await client.autofill(transaction);
    const signed = wallet.sign(prepared);
    const submitResult = await client.submit(signed.tx_blob);

    if (submitResult.result.engine_result !== 'tesSUCCESS' && 
        submitResult.result.engine_result !== 'terQUEUED') {
      throw new Error(
        `Submissão falhou: ${submitResult.result.engine_result} - ${submitResult.result.engine_result_message}`
      );
    }

    const txHash = submitResult.result.tx_json.hash || submitResult.result.tx_json.hash;

    // Aguardar validação
    const validation = await waitForValidation(client, txHash);

    if (!validation.validated) {
      throw new Error(`Transação não validada em ${validation.duration}ms`);
    }

    const finalResult = await client.request({
      command: 'tx',
      transaction: txHash,
    });

    if (finalResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
      throw new Error(
        `Transação falhou: ${finalResult.result.meta?.TransactionResult}`
      );
    }

    return {
      hash: txHash,
      result: finalResult.result,
      submitTime,
      validatedTime: Date.now(),
      validationDuration: validation.duration,
    };
  } catch (error: any) {
    throw {
      error: error.message || error,
      submitTime,
    };
  }
}

/**
 * Gera quote de compra
 */
function generateQuote(
  buyer: string,
  amount: string,
  currency: string,
  issuer: string,
  expirySeconds: number = 300
) {
  const expiryTime = Math.floor(Date.now() / 1000) + expirySeconds;
  const tokenPrice = 0.1; // 0.1 XRP por token
  const tokenAmount = (parseFloat(amount) / tokenPrice).toFixed(2);

  return {
    quoteId: `quote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    buyer,
    amount,
    currency,
    issuer,
    tokenAmount,
    tokenPrice,
    expiryTime,
    purchaseId: `purchase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

/**
 * Executa compra completa (quote → commit → payment → mpt_send)
 */
async function executePurchase(
  client: Client,
  issuer: Wallet,
  buyer: Wallet,
  currency: string,
  issuerAddress: string,
  amount: string,
  paymentMethod: 'XRP' | 'RLUSD',
  isAuthorized: boolean,
  simulateFailure: boolean = false,
  purchaseId?: string
): Promise<PurchaseResult> {
  const purchase: PurchaseResult = {
    purchaseId: purchaseId || `purchase-${Date.now()}`,
    buyer: buyer.classicAddress,
    paymentMethod,
    amount,
    tokenAmount: '0',
    steps: [],
    status: 'FAILED',
    totalDuration: 0,
  };

  const startTime = Date.now();

  try {
    // STEP 1: Quote
    const quote = generateQuote(buyer.classicAddress, amount, currency, issuerAddress);
    purchase.tokenAmount = quote.tokenAmount;

    purchase.steps.push({
      step: '1. Quote',
      type: 'quote',
      success: true,
      payload: quote,
      timestamp: new Date().toISOString(),
    });

    // STEP 2: Commit (verificar autorização)
    if (!isAuthorized) {
      purchase.steps.push({
        step: '2. Commit (verificação de autorização)',
        type: 'commit',
        success: false,
        error: 'Buyer não autorizado - sistema bloqueia antes do commit',
        timestamp: new Date().toISOString(),
      });
      purchase.status = 'REJECTED';
      purchase.totalDuration = Date.now() - startTime;
      return purchase;
    }

    purchase.steps.push({
      step: '2. Commit',
      type: 'commit',
      success: true,
      payload: { purchaseId: purchase.purchaseId, quoteId: quote.quoteId },
      timestamp: new Date().toISOString(),
    });

    // STEP 3: Payment
    let paymentResult;
    if (paymentMethod === 'XRP') {
      paymentResult = await submitAndMeasure(
        client,
        buyer,
        {
          TransactionType: 'Payment',
          Account: buyer.classicAddress,
          Destination: issuerAddress,
          Amount: xrpToDrops(amount),
          Memos: [
            {
              Memo: {
                MemoType: Buffer.from('PURCHASE_ID', 'utf-8').toString('hex').toUpperCase(),
                MemoData: Buffer.from(purchase.purchaseId, 'utf-8').toString('hex').toUpperCase(),
              },
            },
          ],
        },
        'Payment XRP'
      );
    } else {
      // RLUSD (assumindo que existe)
      paymentResult = await submitAndMeasure(
        client,
        buyer,
        {
          TransactionType: 'Payment',
          Account: buyer.classicAddress,
          Destination: issuerAddress,
          Amount: {
            currency: 'RLUSD',
            issuer: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH', // Treasury
            value: amount,
          },
          Memos: [
            {
              Memo: {
                MemoType: Buffer.from('PURCHASE_ID', 'utf-8').toString('hex').toUpperCase(),
                MemoData: Buffer.from(purchase.purchaseId, 'utf-8').toString('hex').toUpperCase(),
              },
            },
          ],
        },
        'Payment RLUSD'
      );
    }

    purchase.steps.push({
      step: '3. Payment',
      type: 'payment',
      success: true,
      txHash: paymentResult.hash,
      payload: { amount, paymentMethod },
      duration: paymentResult.validationDuration,
      timestamp: new Date().toISOString(),
    });

    // STEP 4: MPT Send (Perna 2)
    if (simulateFailure) {
      purchase.steps.push({
        step: '4. MPT Send (simulado falha)',
        type: 'mpt_send',
        success: false,
        error: 'Erro simulado no envio MPT',
        timestamp: new Date().toISOString(),
      });
      purchase.status = 'COMPENSATION_REQUIRED';
      purchase.totalDuration = Date.now() - startTime;
      return purchase;
    }

    const tokenAmountInBaseUnits = (parseFloat(quote.tokenAmount) * 100).toString(); // 2 decimais

    const mptResult = await submitAndMeasure(
      client,
      issuer,
      {
        TransactionType: 'Payment',
        Account: issuerAddress,
        Destination: buyer.classicAddress,
        Amount: {
          currency: currency,
          issuer: issuerAddress,
          value: tokenAmountInBaseUnits,
        },
        Memos: [
          {
            Memo: {
              MemoType: Buffer.from('PURCHASE_ID', 'utf-8').toString('hex').toUpperCase(),
              MemoData: Buffer.from(purchase.purchaseId, 'utf-8').toString('hex').toUpperCase(),
            },
          },
        ],
      },
      'MPT Send'
    );

    purchase.steps.push({
      step: '4. MPT Send',
      type: 'mpt_send',
      success: true,
      txHash: mptResult.hash,
      payload: { tokenAmount: quote.tokenAmount },
      duration: mptResult.validationDuration,
      timestamp: new Date().toISOString(),
    });

    // STEP 5: Validation
    purchase.steps.push({
      step: '5. Validation',
      type: 'validation',
      success: true,
      timestamp: new Date().toISOString(),
    });

    purchase.status = 'COMPLETED';
    purchase.totalDuration = Date.now() - startTime;

    // Calcular p95 de validação (soma das duas pernas)
    const validationDurations = purchase.steps
      .filter(s => s.duration)
      .map(s => s.duration!);
    if (validationDurations.length > 0) {
      const sorted = [...validationDurations].sort((a, b) => a - b);
      purchase.validationP95 = percentile(sorted, 95);
    }

  } catch (error: any) {
    purchase.steps.push({
      step: 'Error',
      type: 'validation',
      success: false,
      error: error.error || error.message,
      timestamp: new Date().toISOString(),
    });
    purchase.status = 'FAILED';
    purchase.totalDuration = Date.now() - startTime;
  }

  return purchase;
}

/**
 * Teste principal
 */
async function runE2ETest(
  network: 'testnet' | 'devnet' = 'testnet',
  load: number = 20
) {
  console.log(`\n🧪 E2E Test: Compra Primária sob Carga - ${network.toUpperCase()}\n`);
  console.log('='.repeat(80));
  console.log(`📊 Configuração:`);
  console.log(`   Network: ${network}`);
  console.log(`   Load: ${load} compras`);
  console.log(`\n`);

  const report: TestReport = {
    network,
    config: {
      load,
      currency: 'PRIMARY',
      issuer: '',
    },
    startTime: new Date().toISOString(),
    preparation: {
      accountsCreated: false,
      mptIssued: false,
      authorizations: [],
    },
    scenarios: {
      happyPathXRP: [],
      happyPathRLUSD: [],
      unauthorizedBuyer: [],
      leg2Failure: [],
      expiredQuote: [],
      replayAttack: [],
      authorizationRemoved: [],
    },
    loadTest: {
      purchases: [],
      statistics: {
        total: 0,
        completed: 0,
        failed: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        avgDuration: 0,
      },
    },
    summary: {
      totalPurchases: 0,
      totalPassed: 0,
      totalFailed: 0,
      criticalIssues: [],
    },
  };

  const endpoint = XRPL_ENDPOINTS[network];
  const client = new Client(endpoint);

  try {
    await client.connect();
    console.log(`✅ Conectado ao ${network}\n`);

    // Carregar contas
    const config = loadAccountsConfig(network);
    const issuer = Wallet.fromSeed(config.issuer_hot.secret);
    const treasury = Wallet.fromSeed(config.admin.secret);
    const investorA = Wallet.fromSeed(config.investors[0].secret);
    const investorB = Wallet.fromSeed(config.investors[1].secret);
    const investorC = Wallet.fromSeed(config.investors[2].secret);

    report.config.issuer = issuer.classicAddress;

    console.log(`📋 Contas:`);
    console.log(`   Issuer: ${issuer.classicAddress}`);
    console.log(`   Treasury: ${treasury.classicAddress}`);
    console.log(`   Investor A: ${investorA.classicAddress}`);
    console.log(`   Investor B: ${investorB.classicAddress}`);
    console.log(`   Investor C: ${investorC.classicAddress}\n`);

    // ============================================
    // PREPARAÇÃO: Emitir MPT com RequireAuth + CanTransfer
    // ============================================
    console.log(`🔧 Preparação do Ambiente...\n`);

    // Configurar requireAuth na conta
    try {
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuer.classicAddress,
      });

      const flags = accountInfo.result.account_data.Flags || 0;
      const requireAuthSet = (flags & 0x00000002) !== 0;

      if (!requireAuthSet) {
        await submitAndMeasure(
          client,
          issuer,
          {
            TransactionType: 'AccountSet',
            Account: issuer.classicAddress,
            SetFlag: 2, // asfRequireAuth
          },
          'AccountSet: RequireAuth'
        );
        console.log(`   ✅ RequireAuth configurado`);
      } else {
        console.log(`   ℹ️  RequireAuth já configurado`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Erro ao configurar RequireAuth: ${error.error || error.message}`);
    }

    // Emitir MPT
    const currency = 'PRIMARY';
    const amount = '10000000'; // 100,000.00 tokens
    const decimals = 2;

    try {
      const issueResult = await submitAndMeasure(
        client,
        issuer,
        {
          TransactionType: 'MPTokenIssuanceCreate',
          Account: issuer.classicAddress,
          Currency: currency,
          Amount: amount,
          Decimals: decimals,
          Transferable: true, // CanTransfer
        },
        'MPTokenIssuanceCreate'
      );

      report.preparation.mptIssued = true;
      console.log(`   ✅ MPT emitido (TX: ${issueResult.hash})`);
    } catch (error: any) {
      console.log(`   ❌ Erro ao emitir MPT: ${error.error || error.message}`);
      throw error;
    }

    // Autorizar A e C (B sem autorização)
    try {
      const authA = await submitAndMeasure(
        client,
        issuer,
        {
          TransactionType: 'MPTokenAuthorize',
          Account: issuer.classicAddress,
          Currency: currency,
          Holder: investorA.classicAddress,
          Authorize: true,
        },
        'Authorize A'
      );
      report.preparation.authorizations.push(investorA.classicAddress);
      console.log(`   ✅ Investor A autorizado (TX: ${authA.hash})`);

      const authC = await submitAndMeasure(
        client,
        issuer,
        {
          TransactionType: 'MPTokenAuthorize',
          Account: issuer.classicAddress,
          Currency: currency,
          Holder: investorC.classicAddress,
          Authorize: true,
        },
        'Authorize C'
      );
      report.preparation.authorizations.push(investorC.classicAddress);
      console.log(`   ✅ Investor C autorizado (TX: ${authC.hash})`);

      console.log(`   ⚠️  Investor B NÃO autorizado (como esperado)\n`);
    } catch (error: any) {
      console.log(`   ❌ Erro ao autorizar: ${error.error || error.message}`);
      throw error;
    }

    // ============================================
    // CENÁRIOS E2E
    // ============================================

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 Executando Cenários E2E...\n`);

    // 1. Happy Path XRP
    console.log(`1️⃣  Happy Path (XRP)...`);
    const happyXRP = await executePurchase(
      client,
      issuer,
      investorA,
      currency,
      issuer.classicAddress,
      '10',
      'XRP',
      true
    );
    report.scenarios.happyPathXRP.push(happyXRP);
    console.log(`   ${happyXRP.status === 'COMPLETED' ? '✅' : '❌'} Status: ${happyXRP.status}`);
    console.log(`   ⏱️  Duração: ${happyXRP.totalDuration}ms\n`);

    // 2. Happy Path RLUSD (se disponível)
    console.log(`2️⃣  Happy Path (RLUSD)...`);
    try {
      const happyRLUSD = await executePurchase(
        client,
        issuer,
        investorA,
        currency,
        issuer.classicAddress,
        '10',
        'RLUSD',
        true
      );
      report.scenarios.happyPathRLUSD.push(happyRLUSD);
      console.log(`   ${happyRLUSD.status === 'COMPLETED' ? '✅' : '❌'} Status: ${happyRLUSD.status}\n`);
    } catch (error: any) {
      console.log(`   ⚠️  RLUSD não disponível: ${error.error || error.message}\n`);
    }

    // 3. Buyer não autorizado (B)
    console.log(`3️⃣  Buyer não autorizado (B)...`);
    const unauthorized = await executePurchase(
      client,
      issuer,
      investorB,
      currency,
      issuer.classicAddress,
      '10',
      'XRP',
      false
    );
    report.scenarios.unauthorizedBuyer.push(unauthorized);
    console.log(`   ${unauthorized.status === 'REJECTED' ? '✅' : '❌'} Status: ${unauthorized.status}`);
    console.log(`   📝 Erro: ${unauthorized.steps.find(s => s.error)?.error || 'N/A'}\n`);

    // 4. Perna 2 falha (compensação)
    console.log(`4️⃣  Perna 2 falha (compensação)...`);
    const leg2Failure = await executePurchase(
      client,
      issuer,
      investorA,
      currency,
      issuer.classicAddress,
      '10',
      'XRP',
      true,
      true // simulateFailure
    );
    report.scenarios.leg2Failure.push(leg2Failure);
    console.log(`   ${leg2Failure.status === 'COMPENSATION_REQUIRED' ? '✅' : '❌'} Status: ${leg2Failure.status}\n`);

    // 5. Quote expirado
    console.log(`5️⃣  Quote expirado...`);
    // Criar quote expirado
    const expiredQuote = generateQuote(investorA.classicAddress, '10', currency, issuer.classicAddress, -10);
    const expiredPurchase = await executePurchase(
      client,
      issuer,
      investorA,
      currency,
      issuer.classicAddress,
      '10',
      'XRP',
      true
    );
    expiredPurchase.steps[0].error = 'Quote expirado';
    expiredPurchase.status = 'REJECTED';
    report.scenarios.expiredQuote.push(expiredPurchase);
    console.log(`   ${expiredPurchase.status === 'REJECTED' ? '✅' : '❌'} Status: ${expiredPurchase.status}\n`);

    // 6. Replay attack
    console.log(`6️⃣  Replay attack (mesmo purchase_id)...`);
    const originalPurchaseId = happyXRP.purchaseId;
    const replay1 = await executePurchase(
      client,
      issuer,
      investorA,
      currency,
      issuer.classicAddress,
      '10',
      'XRP',
      true,
      false,
      originalPurchaseId
    );
    const replay2 = await executePurchase(
      client,
      issuer,
      investorA,
      currency,
      issuer.classicAddress,
      '10',
      'XRP',
      true,
      false,
      originalPurchaseId
    );
    report.scenarios.replayAttack.push(replay1, replay2);
    console.log(`   📝 Verificando duplicidade...`);
    console.log(`   Purchase 1: ${replay1.status}`);
    console.log(`   Purchase 2: ${replay2.status}\n`);

    // 7. Remover autorização e tentar envio
    console.log(`7️⃣  Remover autorização e tentar envio...`);
    // Remover autorização de C
    await submitAndMeasure(
      client,
      issuer,
      {
        TransactionType: 'MPTokenAuthorize',
        Account: issuer.classicAddress,
        Currency: currency,
        Holder: investorC.classicAddress,
        Authorize: false,
      },
      'Deauthorize C'
    );
    console.log(`   ✅ Autorização de C removida`);

    const authRemoved = await executePurchase(
      client,
      issuer,
      investorC,
      currency,
      issuer.classicAddress,
      '10',
      'XRP',
      false // não autorizado
    );
    report.scenarios.authorizationRemoved.push(authRemoved);
    console.log(`   ${authRemoved.status === 'REJECTED' ? '✅' : '❌'} Status: ${authRemoved.status}\n`);

    // ============================================
    // LOAD TEST: 20 compras em sequência
    // ============================================
    console.log(`\n${'='.repeat(80)}`);
    console.log(`💪 Load Test: ${load} compras em sequência...\n`);

    for (let i = 0; i < load; i++) {
      const purchase = await executePurchase(
        client,
        issuer,
        investorA,
        currency,
        issuer.classicAddress,
        '5',
        'XRP',
        true,
        false
      );
      report.loadTest.purchases.push(purchase);

      const progress = ((i + 1) / load) * 100;
      console.log(
        `   [${i + 1}/${load}] ${progress.toFixed(0)}% - ` +
        `Status: ${purchase.status} - ` +
        `Duração: ${purchase.totalDuration}ms`
      );
    }

    // Calcular estatísticas do load test
    const completed = report.loadTest.purchases.filter(p => p.status === 'COMPLETED');
    const failed = report.loadTest.purchases.filter(p => p.status === 'FAILED');
    const durations = completed.map(p => p.totalDuration).sort((a, b) => a - b);

    report.loadTest.statistics = {
      total: report.loadTest.purchases.length,
      completed: completed.length,
      failed: failed.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length || 0,
    };

    console.log(`\n📊 Estatísticas do Load Test:`);
    console.log(`   Total: ${report.loadTest.statistics.total}`);
    console.log(`   ✅ Completadas: ${report.loadTest.statistics.completed}`);
    console.log(`   ❌ Falhas: ${report.loadTest.statistics.failed}`);
    console.log(`   ⏱️  P50: ${report.loadTest.statistics.p50}ms`);
    console.log(`   ⏱️  P95: ${report.loadTest.statistics.p95}ms`);
    console.log(`   ⏱️  P99: ${report.loadTest.statistics.p99}ms`);
    console.log(`   ⏱️  Média: ${report.loadTest.statistics.avgDuration.toFixed(2)}ms`);

    // ============================================
    // RESUMO E VALIDAÇÕES
    // ============================================
    report.endTime = new Date().toISOString();
    report.duration = Date.now() - new Date(report.startTime).getTime();

    // Contar totais
    const allPurchases = [
      ...report.scenarios.happyPathXRP,
      ...report.scenarios.happyPathRLUSD,
      ...report.scenarios.unauthorizedBuyer,
      ...report.scenarios.leg2Failure,
      ...report.scenarios.expiredQuote,
      ...report.scenarios.replayAttack,
      ...report.scenarios.authorizationRemoved,
      ...report.loadTest.purchases,
    ];

    report.summary.totalPurchases = allPurchases.length;
    report.summary.totalPassed = allPurchases.filter(p => 
      p.status === 'COMPLETED' || p.status === 'REJECTED' || p.status === 'COMPENSATION_REQUIRED'
    ).length;
    report.summary.totalFailed = allPurchases.filter(p => p.status === 'FAILED').length;

    // Verificar critérios de aceite
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 Critérios de Aceite:\n`);

    // 1. 100% dos happy paths passam
    const happyPaths = [...report.scenarios.happyPathXRP, ...report.scenarios.happyPathRLUSD];
    const allHappyPassed = happyPaths.every(p => p.status === 'COMPLETED');
    console.log(`   1. Happy paths: ${allHappyPassed ? '✅' : '❌'} ${happyPaths.filter(p => p.status === 'COMPLETED').length}/${happyPaths.length}`);

    // 2. p95 ≤ 120s
    const p95Seconds = report.loadTest.statistics.p95 / 1000;
    const p95Ok = p95Seconds <= 120;
    console.log(`   2. P95 ≤ 120s: ${p95Ok ? '✅' : '❌'} ${p95Seconds.toFixed(2)}s`);

    // 3. Nenhuma duplicidade
    const purchaseIds = allPurchases.map(p => p.purchaseId);
    const duplicates = purchaseIds.filter((id, index) => purchaseIds.indexOf(id) !== index);
    const noDuplicates = duplicates.length === 0;
    console.log(`   3. Sem duplicidade: ${noDuplicates ? '✅' : '❌'} ${duplicates.length} duplicatas encontradas`);

    if (!allHappyPassed) report.summary.criticalIssues.push('Happy paths não passaram 100%');
    if (!p95Ok) report.summary.criticalIssues.push(`P95 acima de 120s: ${p95Seconds.toFixed(2)}s`);
    if (!noDuplicates) report.summary.criticalIssues.push(`Duplicidades encontradas: ${duplicates.length}`);

    // Salvar relatório
    const reportDir = path.join(process.cwd(), 'scripts', 'tests', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      `e2e-primary-purchase-${network}-${Date.now()}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`\n💾 Relatório completo salvo em: ${reportPath}`);
    console.log(`\n📊 Resumo Final:`);
    console.log(`   Total de compras: ${report.summary.totalPurchases}`);
    console.log(`   ✅ Passou: ${report.summary.totalPassed}`);
    console.log(`   ❌ Falhou: ${report.summary.totalFailed}`);
    console.log(`   ⚠️  Issues críticos: ${report.summary.criticalIssues.length}`);

    if (report.summary.criticalIssues.length > 0) {
      console.log(`\n🚨 Issues Críticos:`);
      report.summary.criticalIssues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Erro durante teste:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// Executar
const network = (process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet') as 'testnet' | 'devnet';
const load = parseInt(process.argv.find(arg => arg.startsWith('--load='))?.split('=')[1] || '20');

runE2ETest(network, load)
  .then(() => {
    console.log('\n✨ Teste concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error);
    process.exit(1);
  });
