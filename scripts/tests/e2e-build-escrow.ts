#!/usr/bin/env tsx
/**
 * E2E Test: BUILD Escrow (Finish/Cancel)
 * 
 * Testa o fluxo de escrow para BUILD-MPT:
 * 1. Emissão de BUILD-MPT
 * 2. Criação de Escrow (condicional)
 * 3. Finish Escrow (conclusão)
 * 4. Cancel Escrow (cancelamento)
 * 
 * Uso: tsx scripts/tests/e2e-build-escrow.ts [--network=testnet|devnet]
 */

import { Client, Wallet, xrpToDrops } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';

const XRPL_ENDPOINTS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

interface TestResult {
  step: string;
  success: boolean;
  txHash?: string;
  escrowId?: string;
  error?: string;
  duration: number;
  timestamp: string;
}

interface TestReport {
  network: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
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
 * Converte string para hex
 */
function stringToHex(str: string): string {
  return Buffer.from(str, 'utf-8').toString('hex').toUpperCase();
}

/**
 * Executa transação e aguarda confirmação
 */
async function submitAndWait(
  client: Client,
  wallet: Wallet,
  transaction: any,
  description: string
): Promise<{ hash: string; result: any }> {
  const prepared = await client.autofill(transaction);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
    throw new Error(
      `${description} falhou: ${result.result.meta?.TransactionResult}`
    );
  }

  return {
    hash: result.result.hash,
    result: result.result,
  };
}

/**
 * Obtém sequência atual da conta
 */
async function getAccountSequence(client: Client, address: string): Promise<number> {
  const response = await client.request({
    command: 'account_info',
    account: address,
    ledger_index: 'validated',
  });

  return response.result.account_data.Sequence;
}

/**
 * Cria condição de escrow (time-based)
 */
function createEscrowCondition(fulfillmentTime: number): string {
  // Condição simples: tempo de conclusão
  // Em produção, usaríamos condições mais complexas (crypto-conditions)
  // Por enquanto, usamos uma condição que será satisfeita após o tempo
  return Buffer.from(JSON.stringify({ fulfillmentTime })).toString('hex').toUpperCase();
}

/**
 * Teste E2E Escrow
 */
async function runE2ETest(network: 'testnet' | 'devnet' = 'testnet') {
  console.log(`\n🧪 E2E Test: BUILD Escrow - ${network.toUpperCase()}\n`);
  console.log('='.repeat(70));

  const report: TestReport = {
    network,
    startTime: new Date().toISOString(),
    results: [],
    summary: { total: 0, passed: 0, failed: 0 },
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

    console.log(`📋 Contas carregadas:`);
    console.log(`   Issuer: ${issuer.classicAddress}`);
    console.log(`   Investor: ${investor.classicAddress}\n`);

    const currency = 'BUILD';
    const amount = '500000'; // 5,000.00 tokens (2 decimais)
    const decimals = 2;

    // ============================================
    // STEP 1: Emissão de BUILD-MPT
    // ============================================
    {
      const step = '1. Emissão de BUILD-MPT';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const metadata = {
          MemoType: stringToHex('XLS-89'),
          MemoData: stringToHex(
            JSON.stringify({
              name: 'BUILD-MPT-TEST',
              description: 'Token de teste para escrow',
              purpose: 'Financiamento de construção',
            })
          ),
        };

        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenIssuanceCreate',
            Account: issuer.classicAddress,
            Currency: currency,
            Amount: amount,
            Decimals: decimals,
            Transferable: true,
            Memos: [{ Memo: metadata }],
          },
          step
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 2: Authorize para investor
    // ============================================
    {
      const step = '2. Authorize para Investor';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'MPTokenAuthorize',
            Account: issuer.classicAddress,
            Currency: currency,
            Holder: investor.classicAddress,
            Authorize: true,
          },
          step
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 3: Criar Escrow (condicional)
    // ============================================
    let escrowId: string | undefined;
    {
      const step = '3. Criar Escrow condicional';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        // Calcular tempo de conclusão (30 segundos no futuro)
        const fulfillmentTime = Math.floor(Date.now() / 1000) + 30;
        const condition = createEscrowCondition(fulfillmentTime);

        // Criar escrow com tokens BUILD
        const escrowAmount = '100000'; // 1000.00 tokens
        const escrowSequence = await getAccountSequence(client, issuer.classicAddress);

        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'EscrowCreate',
            Account: issuer.classicAddress,
            Destination: investor.classicAddress,
            Amount: {
              currency: currency,
              issuer: issuer.classicAddress,
              value: escrowAmount,
            },
            Condition: condition,
            CancelAfter: fulfillmentTime + 60, // Pode cancelar após 60s
            FinishAfter: fulfillmentTime, // Pode finalizar após 30s
          },
          step
        );

        // Extrair escrow ID do resultado
        escrowId = tx.result.meta?.AffectedNodes?.find(
          (node: any) => node.CreatedNode?.LedgerEntryType === 'Escrow'
        )?.CreatedNode?.LedgerIndex;

        if (!escrowId) {
          // Tentar obter do hash ou sequence
          escrowId = `${issuer.classicAddress}:${escrowSequence}`;
        }

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          escrowId,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   📦 Escrow ID: ${escrowId}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        throw error;
      }
    }

    // Aguardar tempo de conclusão
    console.log(`\n⏳ Aguardando tempo de conclusão do escrow (30s)...`);
    await new Promise(resolve => setTimeout(resolve, 35000));

    // ============================================
    // STEP 4: Finish Escrow (conclusão)
    // ============================================
    {
      const step = '4. Finish Escrow';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        if (!escrowId) {
          throw new Error('Escrow ID não encontrado');
        }

        // Obter owner do escrow
        const escrowResponse = await client.request({
          command: 'account_objects',
          account: issuer.classicAddress,
          type: 'escrow',
        });

        const escrow = escrowResponse.result.account_objects.find(
          (obj: any) => obj.Destination === investor.classicAddress
        );

        if (!escrow) {
          throw new Error('Escrow não encontrado');
        }

        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'EscrowFinish',
            Account: issuer.classicAddress,
            Owner: issuer.classicAddress,
            OfferSequence: escrow.Sequence,
            Condition: createEscrowCondition(Math.floor(Date.now() / 1000) - 1),
            Fulfillment: 'A0028000', // Fulfillment simples para teste
          },
          step
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          escrowId,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
        console.log(`   ⚠️  Tentando cancelar escrow alternativo...`);
      }
    }

    // ============================================
    // STEP 5: Criar novo Escrow para testar Cancel
    // ============================================
    let cancelEscrowId: string | undefined;
    {
      const step = '5. Criar Escrow para Cancel';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        const cancelAfter = Math.floor(Date.now() / 1000) + 60;
        const escrowAmount = '50000'; // 500.00 tokens

        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'EscrowCreate',
            Account: issuer.classicAddress,
            Destination: investor.classicAddress,
            Amount: {
              currency: currency,
              issuer: issuer.classicAddress,
              value: escrowAmount,
            },
            CancelAfter: cancelAfter,
          },
          step
        );

        const escrowResponse = await client.request({
          command: 'account_objects',
          account: issuer.classicAddress,
          type: 'escrow',
        });

        const escrow = escrowResponse.result.account_objects.find(
          (obj: any) => obj.Destination === investor.classicAddress && obj.CancelAfter
        );

        cancelEscrowId = escrow?.Sequence?.toString();

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          escrowId: cancelEscrowId,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   📦 Escrow ID: ${cancelEscrowId}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
      }
    }

    // ============================================
    // STEP 6: Cancel Escrow
    // ============================================
    {
      const step = '6. Cancel Escrow';
      const startTime = Date.now();
      console.log(`\n${step}...`);

      try {
        if (!cancelEscrowId) {
          throw new Error('Escrow ID para cancelamento não encontrado');
        }

        // Aguardar tempo de cancelamento
        console.log(`   ⏳ Aguardando tempo de cancelamento (60s)...`);
        await new Promise(resolve => setTimeout(resolve, 65000));

        const escrowResponse = await client.request({
          command: 'account_objects',
          account: issuer.classicAddress,
          type: 'escrow',
        });

        const escrow = escrowResponse.result.account_objects.find(
          (obj: any) => obj.Sequence?.toString() === cancelEscrowId
        );

        if (!escrow) {
          throw new Error('Escrow não encontrado para cancelamento');
        }

        const tx = await submitAndWait(
          client,
          issuer,
          {
            TransactionType: 'EscrowCancel',
            Account: issuer.classicAddress,
            Owner: issuer.classicAddress,
            OfferSequence: escrow.Sequence,
          },
          step
        );

        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: true,
          txHash: tx.hash,
          escrowId: cancelEscrowId,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.passed++;

        console.log(`   ✅ Sucesso! TX: ${tx.hash}`);
        console.log(`   ⏱️  Duração: ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        report.results.push({
          step,
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });
        report.summary.total++;
        report.summary.failed++;

        console.log(`   ❌ Erro: ${error.message}`);
      }
    }

    // Finalizar relatório
    report.endTime = new Date().toISOString();
    report.duration = Date.now() - new Date(report.startTime).getTime();

    console.log(`\n${'='.repeat(70)}`);
    console.log(`\n📊 Resumo do Teste:`);
    console.log(`   Total de steps: ${report.summary.total}`);
    console.log(`   ✅ Passou: ${report.summary.passed}`);
    console.log(`   ❌ Falhou: ${report.summary.failed}`);
    console.log(`   ⏱️  Duração total: ${(report.duration / 1000).toFixed(2)}s`);

    // Salvar relatório
    const reportDir = path.join(process.cwd(), 'scripts', 'tests', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      `e2e-build-escrow-${network}-${Date.now()}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n💾 Relatório salvo em: ${reportPath}`);

    if (report.summary.failed > 0) {
      throw new Error('Alguns testes falharam');
    }

  } catch (error) {
    console.error('\n❌ Erro durante teste:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// Executar
const network = (process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet') as 'testnet' | 'devnet';

runE2ETest(network)
  .then(() => {
    console.log('\n✨ Teste concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error);
    process.exit(1);
  });
