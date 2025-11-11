#!/usr/bin/env tsx
/**
 * E2E Test: Fluxo Completo LAND-MPT
 * 
 * Testa o fluxo completo:
 * 1. Emissão de LAND-MPT
 * 2. Authorize para investidores
 * 3. Compra de tokens pelos investidores
 * 4. Freeze de tokens
 * 5. Emissão de COL-MPT (colateral)
 * 6. Unlock (unfreeze) de tokens
 * 
 * Uso: tsx scripts/tests/e2e-land-flow.ts [--network=testnet|devnet]
 */

import { Client, Wallet, xrpToDrops, dropsToXrp } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';
import { reliableSubmitV2 } from '../../lib/xrpl/reliable-submission-v2';

const XRPL_ENDPOINTS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

interface TestResult {
  step: string;
  success: boolean;
  txHash?: string;
  error?: string;
  duration: number;
  timestamp: string;
}

interface TestReport {
  network: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
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

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config;
}

/**
 * Converte string para hex
 */
function stringToHex(str: string): string {
  return Buffer.from(str, 'utf-8').toString('hex').toUpperCase();
}

/**
 * Cria metadata XLS-89
 */
function createMetadata(name: string, description: string, purpose: string) {
  const metadata = {
    name,
    description,
    purpose,
    geolocation: 'LATAM',
    legalReference: 'TEST-REF-001',
    externalUrl: 'https://terra.fi',
  };

  return {
    MemoType: stringToHex('XLS-89'),
    MemoData: stringToHex(JSON.stringify(metadata)),
  };
}

/**
 * Executa transação e aguarda confirmação
 */
async function submitAndWait(
  client: Client,
  wallet: Wallet,
  transaction: any,
  description: string,
  network: 'testnet' | 'devnet' = 'testnet'
): Promise<{ hash: string; result: any }> {
  const prepared = await client.autofill(transaction);
  const signed = wallet.sign(prepared);
  const submitResult = await reliableSubmitV2(signed.tx_blob, network, {
    maxRetries: 3,
  });

  if (!submitResult.success || !submitResult.txHash) {
    throw new Error(
      `${description} falhou: ${submitResult.error || submitResult.engineResult || 'Unknown error'}`
    );
  }

  // Buscar detalhes da transação
  const txResponse = await client.request({
    command: 'tx',
    transaction: submitResult.txHash,
  });

  return {
    hash: submitResult.txHash,
    result: txResponse.result,
  };
}

/**
 * Teste E2E completo
 */
async function runE2ETest(network: 'testnet' | 'devnet' = 'testnet') {
  console.log(`\n🧪 E2E Test: Fluxo LAND-MPT - ${network.toUpperCase()}\n`);
  console.log('='.repeat(70));

  const report: TestReport = {
    network,
    startTime: new Date().toISOString(),
    results: [],
    summary: { total: 0, passed: 0, failed: 0 },
  };

  const endpoint = XRPL_ENDPOINTS[network];
  const client = new Client(endpoint);

  try {
    await client.connect();
    console.log(`✅ Conectado ao ${network}\n`);

    // Carregar contas
    const config = loadAccountsConfig(network);
    const issuer = Wallet.fromSeed(config.issuer_hot.secret);
    const investor1 = Wallet.fromSeed(config.investors[0].secret);
    const investor2 = Wallet.fromSeed(config.investors[1].secret);

    console.log(`📋 Contas carregadas:`);
    console.log(`   Issuer: ${issuer.address}`);
    console.log(`   Investor1: ${investor1.address}`);
    console.log(`   Investor2: ${investor2.address}\n`);

    const currency = 'LAND';
    const amount = '1000000'; // 10,000.00 tokens (2 decimais)
    const decimals = 2;

    // ============================================
    // STEP 1: Emissão de LAND-MPT
    // ============================================
    {
      const step = '1. Emissão de LAND-MPT';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const metadata = createMetadata(
          'LAND-MPT-TEST',
          'Token de teste para E2E',
          'Teste de tokenização de terrenos'
        );

        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenIssuanceCreate',
            Account: issuer.address,
            Currency: currency,
            Amount: amount,
            Decimals: decimals,
            Transferable: true,
            Memos: [
              {
                Memo: metadata,
              },
            ],
          },
          step,
          network
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 2: Authorize para investidores
    // ============================================
    {
      const step = '2. Authorize para Investor1';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenAuthorize',
            Account: issuer.address,
            Currency: currency,
            Holder: investor1.address,
            Authorize: true,
          },
          step,
          network
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    {
      const step = '2b. Authorize para Investor2';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenAuthorize',
            Account: issuer.address,
            Currency: currency,
            Holder: investor2.address,
            Authorize: true,
          },
          step,
          network
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 3: Compra de tokens (Payment)
    // ============================================
    {
      const step = '3. Investor1 compra 1000 tokens';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const tokenAmount = '100000'; // 1000.00 tokens (2 decimais)
        const xrpAmount = '10'; // 10 XRP

        // Primeiro, Investor1 envia XRP para o issuer
        const paymentTx = await submitAndWait(
          client,
          investor1,
          {
            TransactionType: 'Payment',
            Account: investor1.address,
            Destination: issuer.address,
            Amount: xrpToDrops(xrpAmount),
            Memos: [
              {
                Memo: {
                  MemoType: stringToHex('NOTE'),
                  MemoData: stringToHex('Compra de LAND-MPT'),
                },
              },
            ],
          },
          'Payment XRP'
        );

        // Depois, issuer envia tokens para investor1
        const tokenTx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'Payment',
            Account: issuer.address,
            Destination: investor1.address,
            Amount: {
              currency: currency,
              issuer: issuer.address,
              value: tokenAmount,
            },
          },
          'Payment Tokens'
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tokenTx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! Payment TX: ${paymentTx.hash}`);
        console.log(`   ✅ Token TX: ${tokenTx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 4: Freeze de tokens
    // ============================================
    {
      const step = '4. Freeze tokens do Investor1';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenFreeze',
            Account: issuer.address,
            Currency: currency,
            Holder: investor1.address,
            Freeze: true,
          },
          step,
          network
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 5: Emissão de COL-MPT (colateral)
    // ============================================
    {
      const step = '5. Emissão de COL-MPT (colateral)';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const colAmount = '1000'; // 1000 tokens COL (0 decimais)
        const colMetadata = createMetadata(
          'COL-MPT-TEST',
          'Colateral derivado de LAND-MPT congelado',
          'Representação de colateral para crédito'
        );

        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenIssuanceCreate',
            Account: issuer.address,
            Currency: 'COL',
            Amount: colAmount,
            Decimals: 0,
            Transferable: false,
            Memos: [
              {
                Memo: colMetadata,
              },
            ],
          },
          step,
          network
        );

        // Enviar COL para investor1
        await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'Payment',
            Account: issuer.address,
            Destination: investor1.address,
            Amount: {
              currency: 'COL',
              issuer: issuer.address,
              value: colAmount,
            },
          },
          'Envio de COL'
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 6: Unlock (unfreeze) de tokens
    // ============================================
    {
      const step = '6. Unfreeze tokens do Investor1';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenFreeze',
            Account: issuer.address,
            Currency: currency,
            Holder: investor1.address,
            Freeze: false,
          },
          step,
          network
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // Finalizar relatório
    report.endTime = new Date().toISOString();
    report.duration = Date.now() - new Date(report.startTime).getTime();

    console.log(`\n${'='.repeat(70)}`);
    console.log(`\n📊 Resumo do Teste:`);
    console.log(`   Total de steps: ${report.summary.total}`);
    console.log(`   ✅ Passou: ${report.summary.passed}`);
    console.log(`   ❌ Falhou: ${report.summary.failed}`);
    console.log(`   ⏱️  Duração total: ${(report.duration / 1000).toFixed(2)}s`);

    // Salvar relatório
    const reportDir = path.join(process.cwd(), 'scripts', 'tests', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      `e2e-land-flow-${network}-${Date.now()}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n💾 Relatório salvo em: ${reportPath}`);

    if (report.summary.failed > 0) {
      throw new Error('Alguns testes falharam');
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

runE2ETest(network)
  .then(() => {
    console.log('\n✨ Teste concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error);
    process.exit(1);
  });
