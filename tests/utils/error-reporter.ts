/**
 * Utilitário para reportar erros encontrados durante testes
 * Gera arquivos ERROR_<CATEGORIA>.MD em /docs/errors/
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type ErrorCategory = 
  | 'TRANSFER'
  | 'LOGIN'
  | 'LOCK'
  | 'UI_STATE'
  | 'LEDGER'
  | 'DB'
  | 'CONFIG';

export interface ErrorReport {
  category: ErrorCategory;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  txHash?: string;
  consoleLogs?: string[];
  backendLogs?: string[];
  networkLogs?: string[];
  screenshots?: string[];
  environment: {
    network: string;
    browser?: string;
    timestamp: string;
  };
  relatedIssues?: string[];
}

const ERRORS_DIR = join(process.cwd(), 'docs', 'errors');

/**
 * Garante que o diretório de erros existe
 */
function ensureErrorsDir(): void {
  if (!existsSync(ERRORS_DIR)) {
    mkdirSync(ERRORS_DIR, { recursive: true });
  }
}

/**
 * Gera nome do arquivo de erro
 */
function getErrorFileName(category: ErrorCategory, index?: number): string {
  const baseName = `ERROR_${category}.MD`;
  if (index !== undefined && index > 0) {
    return `ERROR_${category}_${index}.MD`;
  }
  return baseName;
}

/**
 * Verifica se já existe arquivo de erro e retorna próximo índice
 */
function getNextErrorIndex(category: ErrorCategory): number {
  ensureErrorsDir();
  let index = 0;
  
  while (true) {
    const fileName = getErrorFileName(category, index);
    const filePath = join(ERRORS_DIR, fileName);
    
    if (!existsSync(filePath)) {
      return index;
    }
    
    index++;
  }
}

/**
 * Formata relatório de erro em Markdown
 */
function formatErrorReport(report: ErrorReport): string {
  const lines: string[] = [];

  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(`**Categoria:** ${report.category}`);
  lines.push(`**Severidade:** ${report.severity}`);
  lines.push(`**Data:** ${new Date(report.environment.timestamp).toLocaleString('pt-BR')}`);
  lines.push('');

  lines.push('## Descrição');
  lines.push('');
  lines.push(report.description);
  lines.push('');

  lines.push('## Ambiente');
  lines.push('');
  lines.push(`- **Rede:** ${report.environment.network}`);
  if (report.environment.browser) {
    lines.push(`- **Navegador:** ${report.environment.browser}`);
  }
  lines.push(`- **Timestamp:** ${report.environment.timestamp}`);
  lines.push('');

  if (report.txHash) {
    lines.push('## Transação XRPL');
    lines.push('');
    lines.push(`**TX Hash:** \`${report.txHash}\``);
    lines.push('');
    lines.push(`[Ver no Explorer](https://testnet.xrpl.org/transactions/${report.txHash})`);
    lines.push('');
  }

  lines.push('## Comportamento Esperado');
  lines.push('');
  lines.push(report.expectedBehavior);
  lines.push('');

  lines.push('## Comportamento Observado');
  lines.push('');
  lines.push(report.actualBehavior);
  lines.push('');

  lines.push('## Passos para Reproduzir');
  lines.push('');
  report.stepsToReproduce.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step}`);
  });
  lines.push('');

  if (report.consoleLogs && report.consoleLogs.length > 0) {
    lines.push('## Logs do Console (Frontend)');
    lines.push('');
    lines.push('```');
    report.consoleLogs.forEach(log => lines.push(log));
    lines.push('```');
    lines.push('');
  }

  if (report.backendLogs && report.backendLogs.length > 0) {
    lines.push('## Logs do Backend');
    lines.push('');
    lines.push('```');
    report.backendLogs.forEach(log => lines.push(log));
    lines.push('```');
    lines.push('');
  }

  if (report.networkLogs && report.networkLogs.length > 0) {
    lines.push('## Logs de Rede');
    lines.push('');
    lines.push('```');
    report.networkLogs.forEach(log => lines.push(log));
    lines.push('```');
    lines.push('');
  }

  if (report.screenshots && report.screenshots.length > 0) {
    lines.push('## Screenshots');
    lines.push('');
    report.screenshots.forEach((screenshot, idx) => {
      lines.push(`![Screenshot ${idx + 1}](${screenshot})`);
    });
    lines.push('');
  }

  if (report.relatedIssues && report.relatedIssues.length > 0) {
    lines.push('## Issues Relacionadas');
    lines.push('');
    report.relatedIssues.forEach(issue => {
      lines.push(`- ${issue}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Gerado automaticamente em ${new Date().toISOString()}*`);

  return lines.join('\n');
}

/**
 * Reporta um erro e salva em arquivo
 */
export function reportError(error: ErrorReport): string {
  ensureErrorsDir();
  
  const index = getNextErrorIndex(error.category);
  const fileName = getErrorFileName(error.category, index);
  const filePath = join(ERRORS_DIR, fileName);
  
  const content = formatErrorReport(error);
  writeFileSync(filePath, content, 'utf-8');
  
  console.log(`\n❌ Erro reportado: ${fileName}`);
  console.log(`   Categoria: ${error.category}`);
  console.log(`   Severidade: ${error.severity}`);
  console.log(`   Arquivo: ${filePath}\n`);
  
  return filePath;
}

/**
 * Reporta erro rápido (helper)
 */
export function quickErrorReport(
  category: ErrorCategory,
  title: string,
  description: string,
  steps: string[],
  txHash?: string,
  severity: ErrorReport['severity'] = 'MEDIUM'
): string {
  return reportError({
    category,
    title,
    severity,
    description,
    stepsToReproduce: steps,
    expectedBehavior: 'Operação deve completar com sucesso',
    actualBehavior: description,
    txHash,
    environment: {
      network: 'testnet',
      timestamp: new Date().toISOString(),
    },
  });
}
