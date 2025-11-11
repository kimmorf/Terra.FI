#!/usr/bin/env tsx
/**
 * Validação Completa de Features
 * 
 * Valida todas as features implementadas:
 * - Compra primária
 * - DEX/OfferCreate
 * - Colateralização (freeze/unfreeze)
 * - Autorização (auth/deauth)
 * - Login/Autenticação
 * - Operações XRPL
 * 
 * Identifica erros e cria arquivos ERROR_<CATEGORIA>.md
 * 
 * Uso: tsx scripts/validate-all-features.ts [--network=testnet|devnet]
 */

import { Client, Wallet, xrpToDrops } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';

// Função auxiliar para preparar, assinar e submeter transações
async function submitTransaction(
  client: Client,
  wallet: Wallet,
  transaction: any
): Promise<any> {
  const prepared = await client.autofill(transaction);
  const signed = wallet.sign(prepared);
  return await client.submitAndWait(signed.tx_blob);
}

const XRPL_ENDPOINTS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

interface ErrorReport {
  category: string;
  severity: 'Critical' | 'Medium' | 'Low';
  title: string;
  description: string;
  when: string;
  frequency: 'always' | 'intermittent' | 'rare';
  impact: string;
  txHash?: string;
  payload?: any;
  stepsToReproduce: string[];
  testScript?: string;
  timestamp: string;
  network: string;
}

interface ValidationReport {
  network: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  features: {
    primaryPurchase: { passed: boolean; errors: ErrorReport[] };
    dex: { passed: boolean; errors: ErrorReport[] };
    collateralization: { passed: boolean; errors: ErrorReport[] };
    authorization: { passed: boolean; errors: ErrorReport[] };
    login: { passed: boolean; errors: ErrorReport[] };
    xrplOps: { passed: boolean; errors: ErrorReport[] };
  };
  summary: {
    totalFeatures: number;
    passed: number;
    failed: number;
    totalErrors: number;
    criticalErrors: number;
    mediumErrors: number;
    lowErrors: number;
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
 * Cria arquivo de erro
 */
function createErrorFile(error: ErrorReport) {
  const errorsDir = path.join(process.cwd(), 'docs', 'errors');
  if (!fs.existsSync(errorsDir)) {
    fs.mkdirSync(errorsDir, { recursive: true });
  }

  const templatePath = path.join(errorsDir, '.template.md');
  let template = '';

  if (fs.existsSync(templatePath)) {
    template = fs.readFileSync(templatePath, 'utf-8');
  } else {
    // Template básico
    template = `# ERROR_{{CATEGORY}}

## 📋 Resumo
{{TITLE}}

## 🎯 Criticidade
{{SEVERITY}}

## 🔍 Detalhes
- **Quando ocorre:** {{WHEN}}
- **Frequência:** {{FREQUENCY}}
- **Impacto:** {{IMPACT}}

## 📊 Evidências
- **TX Hash:** {{TX_HASH}}
- **Timestamp:** {{TIMESTAMP}}
- **Network:** {{NETWORK}}
- **Payload:** 
\`\`\`json
{{PAYLOAD}}
\`\`\`

## 🔄 Passos para Reproduzir
{{STEPS}}

## ✅ Status
- [ ] Identificado
- [ ] Em análise
- [ ] Em correção
- [ ] Resolvido
- [ ] Testado

**Status atual:** Identificado
**Data identificação:** {{DATE}}

## 🛠️ Solução
[Aguardando correção]

## 📚 Referências
- Teste relacionado: {{TEST_SCRIPT}}
`;
  }

  // Substituir placeholders
  const severityEmoji = {
    Critical: '🚨',
    Medium: '⚠️',
    Low: '🧩',
  };

  const content = template
    .replace(/{{CATEGORY}}/g, error.category)
    .replace(/{{TITLE}}/g, error.title)
    .replace(/{{SEVERITY}}/g, `${severityEmoji[error.severity]} ${error.severity}`)
    .replace(/{{WHEN}}/g, error.when)
    .replace(/{{FREQUENCY}}/g, error.frequency)
    .replace(/{{IMPACT}}/g, error.impact)
    .replace(/{{TX_HASH}}/g, error.txHash || 'N/A')
    .replace(/{{TIMESTAMP}}/g, error.timestamp)
    .replace(/{{NETWORK}}/g, error.network)
    .replace(/{{PAYLOAD}}/g, error.payload ? JSON.stringify(error.payload, null, 2) : 'N/A')
    .replace(/{{STEPS}}/g, error.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n'))
    .replace(/{{TEST_SCRIPT}}/g, error.testScript || 'validate-all-features.ts')
    .replace(/{{DATE}}/g, new Date().toISOString().split('T')[0]);

  const fileName = `ERROR_${error.category}.md`;
  const filePath = path.join(errorsDir, fileName);

  // Se arquivo já existe, adicionar nova seção
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    const newSection = `\n\n---\n\n## 🐛 Erro #${Date.now()}\n\n${content.split('## 📋 Resumo')[1]}`;
    fs.appendFileSync(filePath, newSection);
  } else {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return filePath;
}

/**
 * Validação principal
 */
async function validateAllFeatures(network: 'testnet' | 'devnet' = 'testnet') {
  console.log(`\n🔍 Validação Completa de Features - ${network.toUpperCase()}\n`);
  console.log('='.repeat(80));

  const report: ValidationReport = {
    network,
    startTime: new Date().toISOString(),
    features: {
      primaryPurchase: { passed: false, errors: [] },
      dex: { passed: false, errors: [] },
      collateralization: { passed: false, errors: [] },
      authorization: { passed: false, errors: [] },
      login: { passed: false, errors: [] },
      xrplOps: { passed: false, errors: [] },
    },
    summary: {
      totalFeatures: 6,
      passed: 0,
      failed: 0,
      totalErrors: 0,
      criticalErrors: 0,
      mediumErrors: 0,
      lowErrors: 0,
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
    const investorA = Wallet.fromSeed(config.investors[0].secret);
    const investorB = Wallet.fromSeed(config.investors[1].secret);

    const currency = 'VALIDATE';
    const amount = '1000000'; // 10,000.00 tokens

    console.log(`📋 Testando Features...\n`);

    // ============================================
    // FEATURE 1: Compra Primária
    // ============================================
    console.log(`1️⃣  Compra Primária...`);
    try {
      // Emitir token
      await submitTransaction(client, issuer, {
        TransactionType: 'MPTokenIssuanceCreate',
        Account: issuer.classicAddress,
        Currency: currency,
        Amount: amount,
        Decimals: 2,
        Transferable: true,
      });

      // Autorizar
      await submitTransaction(client, issuer, {
        TransactionType: 'MPTokenAuthorize',
        Account: issuer.classicAddress,
        Currency: currency,
        Holder: investorA.classicAddress,
        Authorize: true,
      });

      // Compra (payment + mpt send)
      const payment = await submitTransaction(client, investorA, {
        TransactionType: 'Payment',
        Account: investorA.classicAddress,
        Destination: issuer.classicAddress,
        Amount: xrpToDrops('10'),
      });

      const mptSend = await submitTransaction(client, issuer, {
        TransactionType: 'Payment',
        Account: issuer.classicAddress,
        Destination: investorA.classicAddress,
        Amount: {
          currency,
          issuer: issuer.classicAddress,
          value: '1000', // 10.00 tokens
        },
      });

      report.features.primaryPurchase.passed = true;
      report.summary.passed++;
      console.log(`   ✅ Passou\n`);
    } catch (error: any) {
      report.features.primaryPurchase.passed = false;
      report.summary.failed++;

      const errorReport: ErrorReport = {
        category: 'TRANSFER',
        severity: 'Critical',
        title: 'Falha na compra primária',
        description: error.message || String(error),
        when: 'Durante execução de compra primária (payment + mpt send)',
        frequency: 'always',
        impact: 'Usuário não consegue comprar tokens MPT',
        txHash: error.txHash,
        payload: error.payload,
        stepsToReproduce: [
          'Emitir token MPT',
          'Autorizar comprador',
          'Executar payment XRP',
          'Enviar tokens MPT',
        ],
        testScript: 'validate-all-features.ts',
        timestamp: new Date().toISOString(),
        network,
      };

      report.features.primaryPurchase.errors.push(errorReport);
      console.log(`   ❌ Falhou: ${error.message}\n`);
    }

    // ============================================
    // FEATURE 2: DEX/OfferCreate
    // ============================================
    console.log(`2️⃣  DEX/OfferCreate...`);
    try {
      const offer = await submitTransaction(client, investorA, {
        TransactionType: 'OfferCreate',
        Account: investorA.classicAddress,
        TakerGets: {
          currency,
          issuer: issuer.classicAddress,
          value: '100', // 1.00 token
        },
        TakerPays: xrpToDrops('0.1'),
        Expiration: Math.floor(Date.now() / 1000) + 3600,
      });

      report.features.dex.passed = true;
      report.summary.passed++;
      console.log(`   ✅ Passou\n`);
    } catch (error: any) {
      report.features.dex.passed = false;
      report.summary.failed++;

      const errorReport: ErrorReport = {
        category: 'DEX',
        severity: 'Medium',
        title: 'Falha ao criar oferta DEX',
        description: error.message || String(error),
        when: 'Durante criação de OfferCreate',
        frequency: 'always',
        impact: 'Usuário não consegue criar ofertas no DEX',
        txHash: error.txHash,
        payload: error.payload,
        stepsToReproduce: [
          'Ter tokens MPT na conta',
          'Criar OfferCreate com TakerGets (MPT) e TakerPays (XRP)',
        ],
        testScript: 'validate-all-features.ts',
        timestamp: new Date().toISOString(),
        network,
      };

      report.features.dex.errors.push(errorReport);
      console.log(`   ❌ Falhou: ${error.message}\n`);
    }

    // ============================================
    // FEATURE 3: Colateralização (Freeze/Unfreeze)
    // ============================================
    console.log(`3️⃣  Colateralização (Freeze/Unfreeze)...`);
    try {
      // Freeze
      const freeze = await submitTransaction(client, issuer, {
        TransactionType: 'MPTokenFreeze',
        Account: issuer.classicAddress,
        Currency: currency,
        Holder: investorA.classicAddress,
        Freeze: true,
      });

      // Unfreeze
      const unfreeze = await submitTransaction(client, issuer, {
        TransactionType: 'MPTokenFreeze',
        Account: issuer.classicAddress,
        Currency: currency,
        Holder: investorA.classicAddress,
        Freeze: false,
      });

      report.features.collateralization.passed = true;
      report.summary.passed++;
      console.log(`   ✅ Passou\n`);
    } catch (error: any) {
      report.features.collateralization.passed = false;
      report.summary.failed++;

      const errorReport: ErrorReport = {
        category: 'MPT_LOCK',
        severity: 'Critical',
        title: 'Falha no freeze/unfreeze de tokens',
        description: error.message || String(error),
        when: 'Durante operação de freeze ou unfreeze',
        frequency: 'always',
        impact: 'Não é possível colateralizar tokens',
        txHash: error.txHash,
        payload: error.payload,
        stepsToReproduce: [
          'Ter tokens MPT na conta',
          'Executar MPTokenFreeze com Freeze: true',
          'Executar MPTokenFreeze com Freeze: false',
        ],
        testScript: 'validate-all-features.ts',
        timestamp: new Date().toISOString(),
        network,
      };

      report.features.collateralization.errors.push(errorReport);
      console.log(`   ❌ Falhou: ${error.message}\n`);
    }

    // ============================================
    // FEATURE 4: Autorização
    // ============================================
    console.log(`4️⃣  Autorização (Authorize/Deauthorize)...`);
    try {
      // Authorize
      const authorize = await submitTransaction(client, issuer, {
        TransactionType: 'MPTokenAuthorize',
        Account: issuer.classicAddress,
        Currency: currency,
        Holder: investorB.classicAddress,
        Authorize: true,
      });

      // Deauthorize
      const deauthorize = await submitTransaction(client, issuer, {
        TransactionType: 'MPTokenAuthorize',
        Account: issuer.classicAddress,
        Currency: currency,
        Holder: investorB.classicAddress,
        Authorize: false,
      });

      report.features.authorization.passed = true;
      report.summary.passed++;
      console.log(`   ✅ Passou\n`);
    } catch (error: any) {
      report.features.authorization.passed = false;
      report.summary.failed++;

      const errorReport: ErrorReport = {
        category: 'AUTH',
        severity: 'Critical',
        title: 'Falha na autorização/deautorização',
        description: error.message || String(error),
        when: 'Durante operação de authorize ou deauthorize',
        frequency: 'always',
        impact: 'Não é possível autorizar/deautorizar holders',
        txHash: error.txHash,
        payload: error.payload,
        stepsToReproduce: [
          'Emitir token MPT com RequireAuth',
          'Executar MPTokenAuthorize com Authorize: true',
          'Executar MPTokenAuthorize com Authorize: false',
        ],
        testScript: 'validate-all-features.ts',
        timestamp: new Date().toISOString(),
        network,
      };

      report.features.authorization.errors.push(errorReport);
      console.log(`   ❌ Falhou: ${error.message}\n`);
    }

    // ============================================
    // FEATURE 5: Login/Autenticação
    // ============================================
    console.log(`5️⃣  Login/Autenticação...`);
    try {
      // Verificar se conta existe e tem saldo
      const accountInfo = await client.request({
        command: 'account_info',
        account: investorA.classicAddress,
      });

      if (!accountInfo.result.account_data) {
        throw new Error('Conta não encontrada');
      }

      // Verificar se tem trustline (indica que pode receber tokens)
      const accountLines = await client.request({
        command: 'account_lines',
        account: investorA.classicAddress,
      });

      report.features.login.passed = true;
      report.summary.passed++;
      console.log(`   ✅ Passou (validação básica)\n`);
    } catch (error: any) {
      report.features.login.passed = false;
      report.summary.failed++;

      const errorReport: ErrorReport = {
        category: 'LOGIN',
        severity: 'Medium',
        title: 'Falha na validação de conta/login',
        description: error.message || String(error),
        when: 'Durante validação de conta/login',
        frequency: 'always',
        impact: 'Usuário não consegue fazer login ou validar conta',
        payload: error.payload,
        stepsToReproduce: [
          'Tentar validar informações da conta',
          'Verificar account_info',
          'Verificar account_lines',
        ],
        testScript: 'validate-all-features.ts',
        timestamp: new Date().toISOString(),
        network,
      };

      report.features.login.errors.push(errorReport);
      console.log(`   ❌ Falhou: ${error.message}\n`);
    }

    // ============================================
    // FEATURE 6: Operações XRPL Básicas
    // ============================================
    console.log(`6️⃣  Operações XRPL Básicas...`);
    try {
      // Testar várias operações básicas
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuer.classicAddress,
      });

      const accountLines = await client.request({
        command: 'account_lines',
        account: issuer.classicAddress,
      });

      const serverInfo = await client.request({
        command: 'server_info',
      });

      report.features.xrplOps.passed = true;
      report.summary.passed++;
      console.log(`   ✅ Passou\n`);
    } catch (error: any) {
      report.features.xrplOps.passed = false;
      report.summary.failed++;

      const errorReport: ErrorReport = {
        category: 'PAYMENT',
        severity: 'Low',
        title: 'Falha em operações XRPL básicas',
        description: error.message || String(error),
        when: 'Durante consulta de informações XRPL',
        frequency: 'intermittent',
        impact: 'Degradação de performance ou indisponibilidade',
        payload: error.payload,
        stepsToReproduce: [
          'Executar account_info',
          'Executar account_lines',
          'Executar server_info',
        ],
        testScript: 'validate-all-features.ts',
        timestamp: new Date().toISOString(),
        network,
      };

      report.features.xrplOps.errors.push(errorReport);
      console.log(`   ❌ Falhou: ${error.message}\n`);
    }

    // Coletar todos os erros
    const allErrors: ErrorReport[] = [
      ...report.features.primaryPurchase.errors,
      ...report.features.dex.errors,
      ...report.features.collateralization.errors,
      ...report.features.authorization.errors,
      ...report.features.login.errors,
      ...report.features.xrplOps.errors,
    ];

    report.summary.totalErrors = allErrors.length;
    report.summary.criticalErrors = allErrors.filter(e => e.severity === 'Critical').length;
    report.summary.mediumErrors = allErrors.filter(e => e.severity === 'Medium').length;
    report.summary.lowErrors = allErrors.filter(e => e.severity === 'Low').length;

    // Criar arquivos de erro
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 Criando arquivos de erro...\n`);

    const createdFiles: string[] = [];
    for (const error of allErrors) {
      const filePath = createErrorFile(error);
      createdFiles.push(filePath);
      console.log(`   ✅ ${path.basename(filePath)}`);
    }

    // Finalizar relatório
    report.endTime = new Date().toISOString();
    report.duration = Date.now() - new Date(report.startTime).getTime();

    // Salvar relatório
    const reportDir = path.join(process.cwd(), 'scripts', 'tests', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      `validation-all-features-${network}-${Date.now()}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    // Exibir resumo
    console.log(`\n${'='.repeat(80)}`);
    console.log(`\n📊 Resumo da Validação:\n`);
    console.log(`   Features testadas: ${report.summary.totalFeatures}`);
    console.log(`   ✅ Passou: ${report.summary.passed}`);
    console.log(`   ❌ Falhou: ${report.summary.failed}`);
    console.log(`\n🐛 Erros encontrados:`);
    console.log(`   Total: ${report.summary.totalErrors}`);
    console.log(`   🚨 Critical: ${report.summary.criticalErrors}`);
    console.log(`   ⚠️  Medium: ${report.summary.mediumErrors}`);
    console.log(`   🧩 Low: ${report.summary.lowErrors}`);
    console.log(`\n💾 Relatório salvo em: ${reportPath}`);
    console.log(`📁 Arquivos de erro criados: ${createdFiles.length}`);

    if (report.summary.criticalErrors > 0) {
      console.log(`\n🚨 ATENÇÃO: ${report.summary.criticalErrors} erro(s) crítico(s) encontrado(s)!`);
    }

  } catch (error) {
    console.error('\n❌ Erro durante validação:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// Executar
const network = (process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet') as 'testnet' | 'devnet';

validateAllFeatures(network)
  .then(() => {
    console.log('\n✨ Validação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Validação falhou:', error);
    process.exit(1);
  });
