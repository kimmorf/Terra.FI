#!/usr/bin/env tsx

/**
 * Script para gerar relatório consolidado de testes
 * 
 * Uso: tsx scripts/generate-test-report.ts [caminho-do-json]
 */

import { generateConsolidatedReport, formatConsolidatedReport, saveReport } from '../tests/utils/report-generator';

const resultsPath = process.argv[2] || './test-results/results.json';

console.log('Gerando relatório consolidado...');
console.log(`Lendo resultados de: ${resultsPath}`);

try {
  const report = generateConsolidatedReport(resultsPath);
  
  console.log('\n' + formatConsolidatedReport(report));
  
  saveReport(report);
  
  process.exit(report.failed > 0 ? 1 : 0);
} catch (error: any) {
  console.error('Erro ao gerar relatório:', error.message);
  process.exit(1);
}
