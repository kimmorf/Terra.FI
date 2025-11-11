#!/usr/bin/env tsx
/**
 * Stress Test: OfferCreate
 * 
 * Testa performance e validação de múltiplas ofertas simultâneas:
 * - Cria N ofertas em paralelo
 * - Mede latência (p50, p95, p99)
 * - Valida sucesso das transações
 * - Analisa taxa de falhas
 * 
 * Uso: tsx scripts/tests/stress-offercreate.ts [--network=testnet|devnet] [--count=100] [--concurrency=10]
 */

import { Client, Wallet, xrpToDrops } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';

const XRPL_ENDPOINTS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

interface OfferResult {
  id: number;
  success: boolean;
  txHash?: string;
  error?: string;
  duration: number;
  timestamp: string;
}

interface StressReport {
  network: string;
  config: {
    totalOffers: number;
    concurrency: number;
  };
  startTime: string;
  endTime?: string;
  duration?: number;
  results: OfferResult[];
  statistics: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    latencies: {
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
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
 * Calcula percentis de um array ordenado
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
}

/**
 * Cria uma oferta (OfferCreate)
 */
async function createOffer(
  client: Client,
  wallet: Wallet,
  takerGets: { currency: string; issuer: string; value: string },
  takerPays: string,
  offerId: number
): Promise<{ hash: string; duration: number }> {
  const startTime = Date.now();

  try {
    const prepared = await client.autofill({
      TransactionType: 'OfferCreate',
      Account: wallet.address,
      TakerGets: takerGets,
      TakerPays: takerPays,
      Expiration: Math.floor(Date.now() / 1000) + 3600, // 1 hora
    });

    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    const duration = Date.now() - startTime;

    if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
      throw new Error(
        `Transação falhou: ${result.result.meta?.TransactionResult}`
      );
    }

    return {
      hash: result.result.hash,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    throw { error: error.message, duration };
  }
}

/**
 * Processa lote de ofertas com controle de concorrência
 */
async function processBatch(
  client: Client,
  wallet: Wallet,
  batch: number[],
  currency: string,
  issuer: string,
  concurrency: number
): Promise<OfferResult[]> {
  const results: OfferResult[] = [];
  const executing: Promise<void>[] = [];

  for (const offerId of batch) {
    const promise = (async () => {
      const takerGets = {
        currency,
        issuer,
        value: '100', // 1.00 token
      };
      const takerPays = xrpToDrops('0.1'); // 0.1 XRP

      try {
        const { hash, duration } = await createOffer(
          client,
          wallet,
          takerGets,
          takerPays,
          offerId
        );

        results.push({
          id: offerId,
          success: true,
          txHash: hash,
          duration,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        results.push({
          id: offerId,
          success: false,
          error: error.error || error.message,
          duration: error.duration || 0,
          timestamp: new Date().toISOString(),
        });
      }
    })();

    executing.push(promise);

    // Controlar concorrência
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex(p => p === promise),
        1
      );
    }
  }

  // Aguardar todas as promessas restantes
  await Promise.all(executing);

  return results;
}

/**
 * Stress test principal
 */
async function runStressTest(
  network: 'testnet' | 'devnet' = 'testnet',
  totalOffers: number = 100,
  concurrency: number = 10
) {
  console.log(`\n💪 Stress Test: OfferCreate - ${network.toUpperCase()}\n`);
  console.log('='.repeat(70));
  console.log(`📊 Configuração:`);
  console.log(`   Total de ofertas: ${totalOffers}`);
  console.log(`   Concorrência: ${concurrency}`);
  console.log(`   Network: ${network}\n`);

  const report: StressReport = {
    network,
    config: {
      totalOffers,
      concurrency,
    },
    startTime: new Date().toISOString(),
    results: [],
    statistics: {
      total: 0,
      successful: 0,
      failed: 0,
      successRate: 0,
      latencies: {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      },
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
    const investor = Wallet.fromSeed(config.investors[0].secret);

    console.log(`📋 Contas:`);
    console.log(`   Issuer: ${issuer.address}`);
    console.log(`   Investor: ${investor.address}\n`);

    // Verificar se token existe, se não, criar
    const currency = 'TEST';
    console.log(`🔍 Verificando token ${currency}...`);

    try {
      const accountLines = await client.request({
        command: 'account_lines',
        account: investor.address,
      });

      const hasToken = accountLines.result.lines?.some(
        (line: any) => line.currency === currency && line.issuer === issuer.address
      );

      if (!hasToken) {
        console.log(`   ⚠️  Token não encontrado. Criando...`);

        // Criar token
        const issuanceTx = {
          TransactionType: 'MPTokenIssuanceCreate',
          Account: issuer.address,
          Currency: currency,
          Amount: '1000000', // 10,000.00 tokens
          Decimals: 2,
          Transferable: true,
        };
        const preparedIssuance = await client.autofill(issuanceTx);
        const signedIssuance = issuer.sign(preparedIssuance);
        await client.submitAndWait(signedIssuance.tx_blob);

        // Authorize
        const authTx = {
          TransactionType: 'MPTokenAuthorize',
          Account: issuer.address,
          Currency: currency,
          Holder: investor.address,
          Authorize: true,
        };
        const preparedAuth = await client.autofill(authTx);
        const signedAuth = issuer.sign(preparedAuth);
        await client.submitAndWait(signedAuth.tx_blob);

        // Enviar tokens
        const paymentTx = {
          TransactionType: 'Payment',
          Account: issuer.address,
          Destination: investor.address,
          Amount: {
            currency,
            issuer: issuer.address,
            value: '10000', // 100.00 tokens
          },
        };
        const preparedPayment = await client.autofill(paymentTx);
        const signedPayment = issuer.sign(preparedPayment);
        await client.submitAndWait(signedPayment.tx_blob);

        console.log(`   ✅ Token criado e enviado\n`);
      } else {
        console.log(`   ✅ Token já existe\n`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Erro ao verificar token: ${error.message}`);
      console.log(`   Continuando mesmo assim...\n`);
    }

    // Criar ofertas em lotes
    console.log(`🚀 Iniciando criação de ${totalOffers} ofertas...\n`);

    const batchSize = concurrency * 2;
    const batches: number[][] = [];

    for (let i = 0; i < totalOffers; i += batchSize) {
      const batch = Array.from(
        { length: Math.min(batchSize, totalOffers - i) },
        (_, j) => i + j + 1
      );
      batches.push(batch);
    }

    let completed = 0;
    for (const batch of batches) {
      const batchResults = await processBatch(
        client,
        investor,
        batch,
        currency,
        issuer.address,
        concurrency
      );

      report.results.push(...batchResults);
      completed += batch.length;

      const successCount = batchResults.filter(r => r.success).length;
      const progress = ((completed / totalOffers) * 100).toFixed(1);

      console.log(
        `   📦 Lote processado: ${batch.length} ofertas | ` +
        `✅ ${successCount} sucesso | ` +
        `❌ ${batch.length - successCount} falhas | ` +
        `Progresso: ${progress}%`
      );
    }

    // Calcular estatísticas
    const successful = report.results.filter(r => r.success);
    const failed = report.results.filter(r => !r.success);
    const latencies = successful.map(r => r.duration).sort((a, b) => a - b);

    report.statistics = {
      total: report.results.length,
      successful: successful.length,
      failed: failed.length,
      successRate: (successful.length / report.results.length) * 100,
      latencies: {
        min: latencies[0] || 0,
        max: latencies[latencies.length - 1] || 0,
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
      },
    };

    // Finalizar relatório
    report.endTime = new Date().toISOString();
    report.duration = Date.now() - new Date(report.startTime).getTime();

    // Exibir resultados
    console.log(`\n${'='.repeat(70)}`);
    console.log(`\n📊 Estatísticas do Stress Test:\n`);
    console.log(`   Total de ofertas: ${report.statistics.total}`);
    console.log(`   ✅ Sucesso: ${report.statistics.successful}`);
    console.log(`   ❌ Falhas: ${report.statistics.failed}`);
    console.log(
      `   📈 Taxa de sucesso: ${report.statistics.successRate.toFixed(2)}%`
    );
    console.log(`\n⏱️  Latências (ms):`);
    console.log(`   Mínima: ${report.statistics.latencies.min}`);
    console.log(`   Máxima: ${report.statistics.latencies.max}`);
    console.log(`   Média: ${report.statistics.latencies.avg.toFixed(2)}`);
    console.log(`   P50: ${report.statistics.latencies.p50}`);
    console.log(`   P95: ${report.statistics.latencies.p95}`);
    console.log(`   P99: ${report.statistics.latencies.p99}`);
    console.log(`\n⏱️  Duração total: ${(report.duration / 1000).toFixed(2)}s`);
    console.log(
      `   Throughput: ${(report.statistics.total / (report.duration / 1000)).toFixed(2)} ofertas/segundo`
    );

    // Análise de erros
    if (failed.length > 0) {
      console.log(`\n❌ Análise de Falhas:`);
      const errorCounts: Record<string, number> = {};
      failed.forEach(f => {
        const error = f.error || 'Unknown';
        errorCounts[error] = (errorCounts[error] || 0) + 1;
      });

      Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([error, count]) => {
          console.log(`   ${error}: ${count} ocorrências`);
        });
    }

    // Salvar relatório
    const reportDir = path.join(process.cwd(), 'scripts', 'tests', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      `stress-offercreate-${network}-${Date.now()}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n💾 Relatório completo salvo em: ${reportPath}`);

    // Validação
    if (report.statistics.successRate < 90) {
      console.log(
        `\n⚠️  AVISO: Taxa de sucesso abaixo de 90% (${report.statistics.successRate.toFixed(2)}%)`
      );
    }

    if (report.statistics.latencies.p95 > 10000) {
      console.log(
        `\n⚠️  AVISO: P95 de latência acima de 10s (${report.statistics.latencies.p95}ms)`
      );
    }

  } catch (error) {
    console.error('\n❌ Erro durante stress test:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// Executar
const network = (process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet') as 'testnet' | 'devnet';
const count = parseInt(process.argv.find(arg => arg.startsWith('--count='))?.split('=')[1] || '100');
const concurrency = parseInt(process.argv.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || '10');

runStressTest(network, count, concurrency)
  .then(() => {
    console.log('\n✨ Stress test concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Stress test falhou:', error);
    process.exit(1);
  });
