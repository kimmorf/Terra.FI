#!/usr/bin/env tsx
/**
 * Script para executar todos os testes em sequência
 * 
 * Uso: tsx scripts/tests/run-all.ts [--network=testnet|devnet]
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const network = (process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet') as 'testnet' | 'devnet';

console.log(`\n🚀 Executando todos os testes - ${network.toUpperCase()}\n`);
console.log('='.repeat(70));

const tests = [
  {
    name: 'Setup de Contas',
    script: 'setup-accounts.ts',
    required: true,
  },
  {
    name: 'E2E: Fluxo LAND-MPT',
    script: 'e2e-land-flow.ts',
    required: false,
  },
  {
    name: 'E2E: BUILD Escrow',
    script: 'e2e-build-escrow.ts',
    required: false,
  },
  {
    name: 'Stress Test: OfferCreate',
    script: 'stress-offercreate.ts',
    args: '--count=50 --concurrency=5',
    required: false,
  },
];

let setupDone = false;

for (const test of tests) {
  console.log(`\n📋 ${test.name}...`);
  console.log('-'.repeat(70));

  try {
    // Verificar se setup já foi feito
    if (test.script === 'setup-accounts.ts') {
      const configPath = path.join(
        process.cwd(),
        'scripts',
        'tests',
        'config',
        `accounts-${network}.json`
      );

      if (fs.existsSync(configPath)) {
        console.log(`   ⚠️  Configuração já existe. Pulando setup.`);
        console.log(`   💡 Para refazer, delete: ${configPath}`);
        setupDone = true;
        continue;
      }
    } else if (!setupDone) {
      // Verificar se setup foi feito
      const configPath = path.join(
        process.cwd(),
        'scripts',
        'tests',
        'config',
        `accounts-${network}.json`
      );

      if (!fs.existsSync(configPath)) {
        console.log(`   ⚠️  Setup não encontrado. Executando primeiro...`);
        execSync(`tsx scripts/tests/setup-accounts.ts --network=${network}`, {
          stdio: 'inherit',
        });
        setupDone = true;
      }
    }

    const scriptPath = `scripts/tests/${test.script}`;
    const args = test.args ? ` ${test.args}` : '';
    const command = `tsx ${scriptPath} --network=${network}${args}`;

    console.log(`   Executando: ${command}\n`);

    execSync(command, {
      stdio: 'inherit',
    });

    console.log(`\n   ✅ ${test.name} concluído com sucesso!`);
  } catch (error) {
    console.error(`\n   ❌ ${test.name} falhou!`);

    if (test.required) {
      console.error(`\n💥 Teste obrigatório falhou. Abortando.`);
      process.exit(1);
    } else {
      console.error(`   ⚠️  Continuando com próximos testes...`);
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`\n✨ Todos os testes concluídos!`);
console.log(`\n📊 Relatórios disponíveis em: scripts/tests/reports/`);
