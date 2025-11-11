/**
 * Stress & Performance Tests
 * Burst de OfferCreate e pagamentos
 * Mede ledger_latency, taxa de falhas e throughput
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  type TestEnvironment,
} from '../setup/xrpl-test-env';
import { reliableSubmit, generateIdempotencyKey } from '../../lib/xrpl/reliable-submission';
import { buildPaymentTransaction } from '../../lib/crossmark/transactions';

interface PerformanceMetrics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number; // tx/s
  errorRate: number;
}

/**
 * Executa burst de transações e coleta métricas
 */
async function runBurstTest(
  env: TestEnvironment,
  count: number,
  currency: string
): Promise<PerformanceMetrics> {
  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;

  const startTime = Date.now();

  // Executa transações em paralelo (com limite)
  const batchSize = 10;
  const batches = Math.ceil(count / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchPromises = [];

    for (let i = 0; i < batchSize && batch * batchSize + i < count; i++) {
      const txStart = Date.now();
      const idempotencyKey = generateIdempotencyKey();

      const paymentTx = buildPaymentTransaction({
        sender: env.issuer.address,
        destination: env.holder1.address,
        amount: '100',
        currency,
        issuer: env.issuer.address,
        memo: `Stress test ${idempotencyKey}`,
      });

      const promise = reliableSubmit(paymentTx, env.network, {
        idempotencyKey,
        maxRetries: 2, // Menos retries para teste de performance
      }).then((result) => {
        const latency = Date.now() - txStart;
        latencies.push(latency);

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        return result;
      });

      batchPromises.push(promise);
    }

    await Promise.all(batchPromises);

    // Pequeno delay entre batches para não sobrecarregar
    if (batch < batches - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const totalTime = Date.now() - startTime;
  const sortedLatencies = latencies.sort((a, b) => a - b);

  return {
    totalTransactions: count,
    successfulTransactions: successful,
    failedTransactions: failed,
    averageLatency:
      latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length || 0,
    p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
    p99Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
    throughput: (count / totalTime) * 1000, // tx/s
    errorRate: (failed / count) * 100,
  };
}

describe('Stress & Performance Tests', () => {
  let env: TestEnvironment;
  let testCurrency: string;

  beforeAll(async () => {
    env = await setupTestEnvironment('testnet');
    testCurrency = 'STRESS';

    // Emite token para testes
    const issuanceTx = {
      TransactionType: 'MPTokenIssuanceCreate',
      Account: env.issuer.address,
      Currency: testCurrency,
      Amount: '1000000000', // Grande quantidade para stress test
      Decimals: 2,
      Transferable: true,
    };

    await reliableSubmit(issuanceTx, env.network, {
      idempotencyKey: generateIdempotencyKey(),
    });
  }, 60000);

  afterAll(async () => {
    await cleanupTestEnvironment(env);
  });

  it('should handle burst of 50 transactions', async () => {
    const metrics = await runBurstTest(env, 50, testCurrency);

    console.log('Burst Test (50 tx) Metrics:', metrics);

    // Taxa de sucesso deve ser >= 95%
    expect(metrics.errorRate).toBeLessThan(5);
    expect(metrics.successfulTransactions).toBeGreaterThan(47);

    // Throughput mínimo
    expect(metrics.throughput).toBeGreaterThan(0.1); // Pelo menos 0.1 tx/s
  }, 300000);

  it('should measure ledger validation latency', async () => {
    const idempotencyKey = generateIdempotencyKey();
    const txStart = Date.now();

    const paymentTx = buildPaymentTransaction({
      sender: env.issuer.address,
      destination: env.holder1.address,
      amount: '100',
      currency: testCurrency,
      issuer: env.issuer.address,
    });

    const result = await reliableSubmit(paymentTx, env.network, {
      idempotencyKey,
      maxRetries: 3,
    });

    const totalLatency = Date.now() - txStart;

    expect(result.success).toBe(true);
    expect(result.validated).toBe(true);

    // Latência de validação deve ser razoável (< 60s)
    expect(totalLatency).toBeLessThan(60000);

    console.log(`Validation latency: ${totalLatency}ms`);
  }, 120000);

  it('should maintain performance under moderate load', async () => {
    const metrics = await runBurstTest(env, 20, testCurrency);

    console.log('Moderate Load Test (20 tx) Metrics:', metrics);

    // Sob carga moderada, deve manter alta taxa de sucesso
    expect(metrics.errorRate).toBeLessThan(10);
    expect(metrics.p95Latency).toBeLessThan(60000); // P95 < 60s
  }, 180000);
});
