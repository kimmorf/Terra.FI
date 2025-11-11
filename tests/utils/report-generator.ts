/**
 * Gerador de relatórios consolidados de testes
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TestReport } from './test-helpers';

export interface ConsolidatedReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;
  tests: TestReport[];
  metrics: {
    p50_validation_time: number;
    p95_validation_time: number;
    p99_validation_time: number;
    total_transactions: number;
    successful_transactions: number;
    failed_transactions: number;
  };
  bugs: Array<{
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    test: string;
    scenario: string;
    error: string;
    txHash?: string;
    reproduction: string[];
  }>;
}

/**
 * Gera relatório consolidado a partir de resultados JSON do Vitest
 */
export function generateConsolidatedReport(resultsPath: string): ConsolidatedReport {
  let results: any;
  
  try {
    const content = readFileSync(resultsPath, 'utf-8');
    results = JSON.parse(content);
  } catch (error) {
    throw new Error(`Erro ao ler resultados: ${error}`);
  }

  const tests: TestReport[] = [];
  const bugs: ConsolidatedReport['bugs'] = [];
  let totalTransactions = 0;
  let successfulTransactions = 0;
  const validationTimes: number[] = [];

  // Processa resultados
  if (results.testResults) {
    for (const testFile of results.testResults) {
      for (const test of testFile.assertionResults || []) {
        const passed = test.status === 'passed';
        
        // Extrai métricas se disponíveis
        const metrics: any[] = [];
        if (test.metrics) {
          metrics.push(...test.metrics);
          totalTransactions += test.metrics.length;
          successfulTransactions += test.metrics.filter((m: any) => m.status === 'tesSUCCESS').length;
          
          test.metrics.forEach((m: any) => {
            if (m.validationTime !== null) {
              validationTimes.push(m.validationTime);
            }
          });
        }

        const testReport: TestReport = {
          testName: test.title || test.fullName || 'Unknown',
          scenario: test.scenario || 'N/A',
          passed,
          metrics,
          steps: test.steps || [],
          errors: test.errors || (passed ? [] : [test.failureMessages?.join('\n') || 'Test failed']),
          timestamps: {
            start: test.startTime || Date.now(),
            end: test.endTime || Date.now(),
            duration: (test.endTime || Date.now()) - (test.startTime || Date.now()),
          },
        };

        tests.push(testReport);

        // Identifica bugs
        if (!passed) {
          bugs.push({
            severity: determineSeverity(testReport),
            test: testReport.testName,
            scenario: testReport.scenario,
            error: testReport.errors.join('; '),
            txHash: testReport.metrics[0]?.txHash,
            reproduction: testReport.steps,
          });
        }
      }
    }
  }

  // Calcula métricas agregadas
  const passed = tests.filter(t => t.passed).length;
  const failed = tests.filter(t => !t.passed).length;
  const passRate = tests.length > 0 ? (passed / tests.length) * 100 : 0;

  // Calcula percentis de tempo de validação
  const sortedTimes = validationTimes.sort((a, b) => a - b);
  const len = sortedTimes.length;
  const p50 = len > 0 ? sortedTimes[Math.floor(len * 0.5)] : 0;
  const p95 = len > 0 ? sortedTimes[Math.floor(len * 0.95)] : 0;
  const p99 = len > 0 ? sortedTimes[Math.floor(len * 0.99)] : 0;

  return {
    timestamp: new Date().toISOString(),
    totalTests: tests.length,
    passed,
    failed,
    passRate,
    tests,
    metrics: {
      p50_validation_time: p50,
      p95_validation_time: p95,
      p99_validation_time: p99,
      total_transactions: totalTransactions,
      successful_transactions: successfulTransactions,
      failed_transactions: totalTransactions - successfulTransactions,
    },
    bugs: bugs.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
  };
}

/**
 * Determina severidade do bug baseado no teste
 */
function determineSeverity(test: TestReport): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const testName = test.testName.toLowerCase();
  const errors = test.errors.join(' ').toLowerCase();

  // Critical: Falhas de segurança, perda de fundos
  if (
    testName.includes('security') ||
    testName.includes('funds') ||
    errors.includes('duplicate') ||
    errors.includes('unauthorized transfer')
  ) {
    return 'CRITICAL';
  }

  // High: Falhas de compliance, transações críticas
  if (
    testName.includes('compliance') ||
    testName.includes('freeze') ||
    testName.includes('clawback') ||
    testName.includes('requireauth')
  ) {
    return 'HIGH';
  }

  // Medium: Falhas de performance, timeouts
  if (
    testName.includes('performance') ||
    testName.includes('timeout') ||
    testName.includes('stress')
  ) {
    return 'MEDIUM';
  }

  // Low: Outros
  return 'LOW';
}

/**
 * Formata relatório consolidado para exibição
 */
export function formatConsolidatedReport(report: ConsolidatedReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(80));
  lines.push('RELATÓRIO CONSOLIDADO DE TESTES E2E - TERRA.FI');
  lines.push('='.repeat(80));
  lines.push(`Data: ${new Date(report.timestamp).toLocaleString('pt-BR')}`);
  lines.push('');

  // Resumo
  lines.push('RESUMO');
  lines.push('-'.repeat(80));
  lines.push(`Total de Testes: ${report.totalTests}`);
  lines.push(`Passou: ${report.passed} (${report.passRate.toFixed(1)}%)`);
  lines.push(`Falhou: ${report.failed}`);
  lines.push('');

  // Métricas
  lines.push('MÉTRICAS DE PERFORMANCE');
  lines.push('-'.repeat(80));
  lines.push(`Tempo de Validação p50: ${report.metrics.p50_validation_time.toFixed(2)}ms`);
  lines.push(`Tempo de Validação p95: ${report.metrics.p95_validation_time.toFixed(2)}ms`);
  lines.push(`Tempo de Validação p99: ${report.metrics.p99_validation_time.toFixed(2)}ms`);
  lines.push(`Total de Transações: ${report.metrics.total_transactions}`);
  lines.push(`Transações Bem-sucedidas: ${report.metrics.successful_transactions}`);
  lines.push(`Transações Falhadas: ${report.metrics.failed_transactions}`);
  lines.push('');

  // Bugs
  if (report.bugs.length > 0) {
    lines.push('BUGS IDENTIFICADOS');
    lines.push('-'.repeat(80));
    report.bugs.forEach((bug, idx) => {
      lines.push(`${idx + 1}. [${bug.severity}] ${bug.test}`);
      lines.push(`   Cenário: ${bug.scenario}`);
      lines.push(`   Erro: ${bug.error}`);
      if (bug.txHash) {
        lines.push(`   TX Hash: ${bug.txHash}`);
      }
      lines.push(`   Reprodução:`);
      bug.reproduction.forEach((step, stepIdx) => {
        lines.push(`     ${stepIdx + 1}. ${step}`);
      });
      lines.push('');
    });
  } else {
    lines.push('Nenhum bug identificado! ✅');
    lines.push('');
  }

  // Detalhes dos testes
  lines.push('DETALHES DOS TESTES');
  lines.push('-'.repeat(80));
  report.tests.forEach((test, idx) => {
    lines.push(`${idx + 1}. ${test.testName} - ${test.passed ? '✅' : '❌'}`);
    lines.push(`   Cenário: ${test.scenario}`);
    lines.push(`   Duração: ${test.timestamps.duration}ms`);
    if (test.metrics.length > 0) {
      lines.push(`   Transações: ${test.metrics.length}`);
    }
    if (!test.passed && test.errors.length > 0) {
      lines.push(`   Erros: ${test.errors.join('; ')}`);
    }
    lines.push('');
  });

  lines.push('='.repeat(80));

  return lines.join('\n');
}

/**
 * Salva relatório em arquivo
 */
export function saveReport(report: ConsolidatedReport, outputDir: string = './test-results'): void {
  try {
    mkdirSync(outputDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = join(outputDir, `report-${timestamp}.json`);
    const txtPath = join(outputDir, `report-${timestamp}.txt`);

    // Salva JSON
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    
    // Salva TXT formatado
    writeFileSync(txtPath, formatConsolidatedReport(report), 'utf-8');

    console.log(`\nRelatórios salvos:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  TXT: ${txtPath}`);
  } catch (error) {
    console.error('Erro ao salvar relatório:', error);
  }
}
