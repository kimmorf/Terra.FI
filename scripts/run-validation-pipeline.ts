#!/usr/bin/env tsx
/**
 * Pipeline Completo de Validação
 * 
 * Executa:
 * 1. Build do projeto
 * 2. Validação de todas as features
 * 3. Monitoramento de erros
 * 4. Geração de relatórios
 * 
 * Uso: tsx scripts/run-validation-pipeline.ts [--network=testnet|devnet]
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const network = (process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet') as 'testnet' | 'devnet';

console.log(`\n🚀 Pipeline Completo de Validação - ${network.toUpperCase()}\n`);
console.log('='.repeat(80));

try {
  // STEP 1: Build
  console.log(`\n1️⃣  Executando build...\n`);
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log(`\n   ✅ Build concluído com sucesso!\n`);
  } catch (error) {
    console.error(`\n   ❌ Build falhou!`);
    throw error;
  }

  // STEP 2: Validação de features
  console.log(`\n2️⃣  Validando todas as features...\n`);
  try {
    execSync(`tsx scripts/validate-all-features.ts --network=${network}`, { stdio: 'inherit' });
    console.log(`\n   ✅ Validação concluída!\n`);
  } catch (error) {
    console.error(`\n   ⚠️  Validação encontrou erros (verifique docs/errors/)\n`);
  }

  // STEP 3: Monitoramento de erros
  console.log(`\n3️⃣  Monitorando erros...\n`);
  try {
    execSync('tsx scripts/monitor-errors.ts --check-new', { stdio: 'inherit' });
  } catch (error) {
    // Não falha o pipeline se houver erros
    console.log(`\n   ⚠️  Erros encontrados (verifique docs/errors/)\n`);
  }

  // STEP 4: Estatísticas
  console.log(`\n4️⃣  Gerando estatísticas...\n`);
  try {
    execSync('tsx scripts/monitor-errors.ts --stats', { stdio: 'inherit' });
  } catch (error) {
    // Não falha o pipeline
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n✨ Pipeline concluído!\n`);
  console.log(`📁 Verifique:`);
  console.log(`   - docs/errors/ para arquivos de erro`);
  console.log(`   - scripts/tests/reports/ para relatórios completos\n`);

} catch (error) {
  console.error(`\n💥 Pipeline falhou:`, error);
  process.exit(1);
}
