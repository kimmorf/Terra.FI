/**
 * Utilitários para testes E2E
 */

import { Client, Wallet } from 'xrpl';
import { xrplPool } from '@/lib/xrpl/pool';
import { verifyTransaction, waitForConfirmation } from '@/lib/xrpl/transactions';
import type { TestAccount } from '../setup/testnet-setup';

export interface TransactionMetrics {
  txHash: string;
  submittedAt: number;
  validatedAt: number | null;
  validationTime: number | null; // ms
  status: string | null;
  error?: string;
}

export interface TestReport {
  testName: string;
  scenario: string;
  passed: boolean;
  metrics: TransactionMetrics[];
  steps: string[];
  errors: string[];
  timestamps: {
    start: number;
    end: number;
    duration: number;
  };
}

/**
 * Aguarda confirmação de transação e retorna métricas
 */
export async function waitForTransactionWithMetrics(
  txHash: string,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet',
  timeout: number = 120000
): Promise<TransactionMetrics> {
  const submittedAt = Date.now();
  
  const result = await waitForConfirmation(txHash, network, timeout);
  
  const validatedAt = result.confirmed ? Date.now() : null;
  const validationTime = validatedAt ? validatedAt - submittedAt : null;

  return {
    txHash,
    submittedAt,
    validatedAt,
    validationTime,
    status: result.status,
    error: result.error,
  };
}

/**
 * Verifica saldo de uma conta
 */
export async function getAccountBalance(
  address: string,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet'
): Promise<number> {
  const client = await xrplPool.getClient(network);
  
  try {
    const accountInfo = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });

    const balanceDrops = accountInfo.result.account_data.Balance;
    return parseFloat(balanceDrops) / 1_000_000;
  } catch (error) {
    throw new Error(`Erro ao obter saldo: ${error}`);
  }
}

/**
 * Verifica saldo de token MPT
 */
export async function getTokenBalance(
  account: string,
  currency: string,
  issuer: string,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet'
): Promise<string> {
  const client = await xrplPool.getClient(network);
  
  try {
    const accountLines = await client.request({
      command: 'account_lines',
      account,
      peer: issuer,
      ledger_index: 'validated',
    });

    const line = (accountLines.result.lines ?? []).find(
      (l: any) => l.currency?.toUpperCase() === currency.toUpperCase() && l.account === issuer
    );

    return line?.balance ?? '0';
  } catch (error) {
    throw new Error(`Erro ao obter saldo de token: ${error}`);
  }
}

/**
 * Verifica se conta tem trustline
 */
export async function hasTrustLine(
  account: string,
  currency: string,
  issuer: string,
  network: 'testnet' | 'mainnet' | 'devnet' = 'testnet'
): Promise<boolean> {
  const client = await xrplPool.getClient(network);
  
  try {
    const accountLines = await client.request({
      command: 'account_lines',
      account,
      peer: issuer,
      ledger_index: 'validated',
    });

    return (accountLines.result.lines ?? []).some(
      (line: any) => 
        line.currency?.toUpperCase() === currency.toUpperCase() && 
        line.account === issuer
    );
  } catch (error) {
    return false;
  }
}

/**
 * Calcula percentis de uma lista de números
 */
export function calculatePercentiles(values: number[]): {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
} {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;

  const p50 = sorted[Math.floor(len * 0.5)];
  const p95 = sorted[Math.floor(len * 0.95)];
  const p99 = sorted[Math.floor(len * 0.99)];
  const min = sorted[0];
  const max = sorted[len - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / len;

  return { p50, p95, p99, min, max, mean };
}

/**
 * Gera relatório de teste
 */
export function generateTestReport(
  testName: string,
  scenario: string,
  passed: boolean,
  metrics: TransactionMetrics[],
  steps: string[],
  errors: string[] = []
): TestReport {
  const start = metrics[0]?.submittedAt ?? Date.now();
  const end = metrics[metrics.length - 1]?.validatedAt ?? Date.now();
  const duration = end - start;

  return {
    testName,
    scenario,
    passed,
    metrics,
    steps,
    errors,
    timestamps: {
      start,
      end,
      duration,
    },
  };
}

/**
 * Formata relatório para exibição
 */
export function formatReport(report: TestReport): string {
  const lines: string[] = [];
  
  lines.push(`\n=== ${report.testName} ===`);
  lines.push(`Cenário: ${report.scenario}`);
  lines.push(`Status: ${report.passed ? '✅ PASSOU' : '❌ FALHOU'}`);
  lines.push(`Duração: ${report.timestamps.duration}ms`);
  
  if (report.metrics.length > 0) {
    const validationTimes = report.metrics
      .map(m => m.validationTime)
      .filter((t): t is number => t !== null);
    
    if (validationTimes.length > 0) {
      const percentiles = calculatePercentiles(validationTimes);
      lines.push(`\nMétricas de Validação:`);
      lines.push(`  p50: ${percentiles.p50.toFixed(2)}ms`);
      lines.push(`  p95: ${percentiles.p95.toFixed(2)}ms`);
      lines.push(`  p99: ${percentiles.p99.toFixed(2)}ms`);
      lines.push(`  min: ${percentiles.min.toFixed(2)}ms`);
      lines.push(`  max: ${percentiles.max.toFixed(2)}ms`);
      lines.push(`  mean: ${percentiles.mean.toFixed(2)}ms`);
    }
  }
  
  lines.push(`\nTransações:`);
  report.metrics.forEach((metric, idx) => {
    lines.push(`  ${idx + 1}. ${metric.txHash.slice(0, 16)}...`);
    lines.push(`     Status: ${metric.status || 'PENDING'}`);
    if (metric.validationTime !== null) {
      lines.push(`     Tempo: ${metric.validationTime}ms`);
    }
    if (metric.error) {
      lines.push(`     Erro: ${metric.error}`);
    }
  });
  
  if (report.steps.length > 0) {
    lines.push(`\nPassos:`);
    report.steps.forEach((step, idx) => {
      lines.push(`  ${idx + 1}. ${step}`);
    });
  }
  
  if (report.errors.length > 0) {
    lines.push(`\nErros:`);
    report.errors.forEach((error, idx) => {
      lines.push(`  ${idx + 1}. ${error}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Simula latência de RPC
 */
export function simulateRPCLatency(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
