#!/usr/bin/env tsx
/**
 * Monitor de Erros
 * 
 * Monitora commits em /docs/errors/ e identifica tipos de erro,
 * classificando por criticidade e abrindo issues correspondentes.
 * 
 * Uso: tsx scripts/monitor-errors.ts [--check-new] [--stats]
 */

import * as fs from 'fs';
import * as path from 'path';

interface ErrorFile {
  file: string;
  category: string;
  content: string;
  status: 'Identificado' | 'Em análise' | 'Em correção' | 'Resolvido' | 'Testado';
  severity: 'Critical' | 'Medium' | 'Low';
  dateIdentified?: string;
  dateResolved?: string;
  commit?: string;
  pr?: string;
}

/**
 * Lê todos os arquivos de erro
 */
function readErrorFiles(): ErrorFile[] {
  const errorsDir = path.join(process.cwd(), 'docs', 'errors');
  
  if (!fs.existsSync(errorsDir)) {
    return [];
  }

  const files = fs.readdirSync(errorsDir)
    .filter(f => f.startsWith('ERROR_') && f.endsWith('.md'))
    .map(file => {
      const filePath = path.join(errorsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const category = file.replace('ERROR_', '').replace('.md', '');

      // Extrair informações do arquivo
      const statusMatch = content.match(/\*\*Status atual:\*\* (.+)/);
      const severityMatch = content.match(/## 🎯 Criticidade\n(🚨|⚠️|🧩) (Critical|Medium|Low)/);
      const dateMatch = content.match(/\*\*Data identificação:\*\* (.+)/);
      const resolvedMatch = content.match(/\*\*Data resolução:\*\* (.+)/);
      const commitMatch = content.match(/\*\*Commit:\*\* (.+)/);
      const prMatch = content.match(/\*\*PR:\*\* (#.+)/);

      return {
        file,
        category,
        content,
        status: (statusMatch?.[1] || 'Identificado') as ErrorFile['status'],
        severity: (severityMatch?.[2] || 'Low') as ErrorFile['severity'],
        dateIdentified: dateMatch?.[1],
        dateResolved: resolvedMatch?.[1],
        commit: commitMatch?.[1],
        pr: prMatch?.[1],
      };
    });

  return files;
}

/**
 * Gera estatísticas
 */
function generateStats() {
  const errors = readErrorFiles();

  const stats = {
    total: errors.length,
    byCategory: {} as Record<string, number>,
    bySeverity: {
      Critical: 0,
      Medium: 0,
      Low: 0,
    },
    byStatus: {
      Identificado: 0,
      'Em análise': 0,
      'Em correção': 0,
      Resolvido: 0,
      Testado: 0,
    },
    unresolved: 0,
  };

  for (const error of errors) {
    stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
    stats.bySeverity[error.severity]++;
    stats.byStatus[error.status]++;

    if (error.status !== 'Resolvido' && error.status !== 'Testado') {
      stats.unresolved++;
    }
  }

  return stats;
}

/**
 * Verifica novos erros
 */
function checkNewErrors() {
  const errors = readErrorFiles();
  const unresolved = errors.filter(e => 
    e.status !== 'Resolvido' && e.status !== 'Testado'
  );

  console.log(`\n🔍 Verificando novos erros...\n`);

  if (unresolved.length === 0) {
    console.log(`✅ Nenhum erro não resolvido encontrado!\n`);
    return;
  }

  console.log(`📋 Erros não resolvidos: ${unresolved.length}\n`);

  // Agrupar por criticidade
  const critical = unresolved.filter(e => e.severity === 'Critical');
  const medium = unresolved.filter(e => e.severity === 'Medium');
  const low = unresolved.filter(e => e.severity === 'Low');

  if (critical.length > 0) {
    console.log(`🚨 Critical (${critical.length}):`);
    critical.forEach(e => {
      console.log(`   - ${e.file} (${e.status})`);
    });
    console.log();
  }

  if (medium.length > 0) {
    console.log(`⚠️  Medium (${medium.length}):`);
    medium.forEach(e => {
      console.log(`   - ${e.file} (${e.status})`);
    });
    console.log();
  }

  if (low.length > 0) {
    console.log(`🧩 Low (${low.length}):`);
    low.forEach(e => {
      console.log(`   - ${e.file} (${e.status})`);
    });
    console.log();
  }

  // Sugerir criação de issues
  const needsIssue = [...critical, ...medium];
  if (needsIssue.length > 0) {
    console.log(`\n💡 Sugestão: Criar issues para:`);
    needsIssue.forEach(e => {
      console.log(`   - ${e.file} → Issue: [${e.category}] ${e.file.replace('.md', '')}`);
    });
  }
}

/**
 * Exibe estatísticas
 */
function displayStats() {
  const stats = generateStats();

  console.log(`\n📊 Estatísticas de Erros\n`);
  console.log('='.repeat(60));
  console.log(`\n📈 Total: ${stats.total} erro(s)`);
  console.log(`\n🔴 Por Criticidade:`);
  console.log(`   🚨 Critical: ${stats.bySeverity.Critical}`);
  console.log(`   ⚠️  Medium: ${stats.bySeverity.Medium}`);
  console.log(`   🧩 Low: ${stats.bySeverity.Low}`);

  console.log(`\n📋 Por Status:`);
  Object.entries(stats.byStatus).forEach(([status, count]) => {
    const icon = status === 'Resolvido' || status === 'Testado' ? '✅' : '⏳';
    console.log(`   ${icon} ${status}: ${count}`);
  });

  console.log(`\n📂 Por Categoria:`);
  Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`   - ${category}: ${count}`);
    });

  console.log(`\n⚠️  Não resolvidos: ${stats.unresolved}`);
  console.log();
}

// Executar
const checkNew = process.argv.includes('--check-new');
const stats = process.argv.includes('--stats');

if (stats) {
  displayStats();
} else if (checkNew) {
  checkNewErrors();
} else {
  console.log(`\n📋 Monitor de Erros\n`);
  console.log(`Uso:`);
  console.log(`  tsx scripts/monitor-errors.ts --stats      # Exibir estatísticas`);
  console.log(`  tsx scripts/monitor-errors.ts --check-new  # Verificar novos erros\n`);
  displayStats();
  checkNewErrors();
}
