#!/usr/bin/env tsx
/**
 * E2E Test: Web3 Authorization Flow
 * 
 * Testa o fluxo completo de autorização MPT:
 * 1. Issue com flags: requireAuth, canTransfer
 * 2. Authorize holder A
 * 3. Send 10 unidades para A (deve passar)
 * 4. Tentar enviar para B sem autorizar (deve falhar)
 * 5. Medir p95 de validação (tempo submit→validated)
 * 6. Reportar tx_hash e payloads
 * 
 * Uso: tsx scripts/tests/e2e-web3-auth.ts [--network=testnet|devnet]
 */

import { Client, Wallet, xrpToDrops } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';

const XRPL_ENDPOINTS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

interface TransactionResult {
  step: string;
  success: boolean;
  txHash?: string;
  payload: any;
  submitTime?: number;
  validatedTime?: number;
  validationDuration?: number;
  error?: string;
  timestamp: string;
}

interface TestReport {
  network: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  results: TransactionResult[];
  statistics: {
    total: number;
    passed: number;
    failed: number;
    validationLatencies: number[];
    p95: number;
    p99: number;
  };
  summary: {
    issue: TransactionResult | null;
    authorize: TransactionResult | null;
    sendToA: TransactionResult | null;
    sendToBFailed: TransactionResult | null;
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
 * Obtém tempo de validação de uma transação
 */
async function waitForValidation(
  client: Client,
  txHash: string,
  maxWaitSeconds: number = 30
): Promise<{ validated: boolean; validatedTime: number; duration: number }> {
  const startTime = Date.now();
  const maxWait = maxWaitSeconds * 1000;

  while (Date.now() - startTime < maxWait) {
    try {
      const response = await client.request({
        command: 'tx',
        transaction: txHash,
      });

      if (response.result.validated) {
        const validatedTime = Date.now();
        const duration = validatedTime - startTime;
        return {
          validated: true,
          validatedTime,
          duration,
        };
      }
    } catch (error: any) {
      // Transação ainda não validada ou não encontrada
      if (error.data?.error !== 'txnNotFound') {
        throw error;
      }
    }

    // Aguardar antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    validated: false,
    validatedTime: Date.now(),
    duration: Date.now() - startTime,
  };
}

/**
 * Submete transação e mede tempo de validação
 */
async function submitAndMeasureValidation(
  client: Client,
  wallet: Wallet,
  transaction: any,
  description: string
): Promise<{
  hash: string;
  result: any;
  submitTime: number;
  validatedTime?: number;
  validationDuration?: number;
  payload: any;
}> {
  const submitTime = Date.now();
  const payload = JSON.parse(JSON.stringify(transaction)); // Deep copy

  try {
    // Preparar e assinar
    const prepared = await client.autofill(transaction);
    const signed = wallet.sign(prepared);

    // Submeter (não aguardar validação ainda)
    const submitResult = await client.request({
      command: 'submit',
      tx_blob: signed.tx_blob,
    });

    if (submitResult.result.engine_result !== 'tesSUCCESS' && 
        submitResult.result.engine_result !== 'terQUEUED') {
      throw new Error(
        `Submissão falhou: ${submitResult.result.engine_result} - ${submitResult.result.engine_result_message}`
      );
    }

    const txHash = submitResult.result.tx_json.hash || submitResult.result.tx_json.hash;

    // Aguardar validação e medir tempo
    const validation = await waitForValidation(client, txHash);

    if (!validation.validated) {
      throw new Error(`Transação não foi validada em ${validation.duration}ms`);
    }

    // Obter resultado final
    const finalResult = await client.request({
      command: 'tx',
      transaction: txHash,
    });

    if (finalResult.result.meta?.TransactionResult !== 'tesSUCCESS') {
      throw new Error(
        `Transação falhou: ${finalResult.result.meta?.TransactionResult}`
      );
    }

    return {
      hash: txHash,
      result: finalResult.result,
      submitTime,
      validatedTime: validation.validatedTime,
      validationDuration: validation.duration,
      payload,
    };
  } catch (error: any) {
    throw {
      error: error.message || error,
      submitTime,
      payload,
    };
  }
}

/**
 * Teste E2E Web3 Authorization
 */
async function runE2ETest(network: 'testnet' | 'devnet' = 'testnet') {
  console.log(`\n🧪 E2E Test: Web3 Authorization Flow - ${network.toUpperCase()}\n`);
  console.log('='.repeat(70));

  const report: TestReport = {
    network,
    startTime: new Date().toISOString(),
    results: [],
    statistics: {
      total: 0,
      passed: 0,
      failed: 0,
      validationLatencies: [],
      p95: 0,
      p99: 0,
    },
    summary: {
      issue: null,
      authorize: null,
      sendToA: null,
      sendToBFailed: null,
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
    const holderA = Wallet.fromSeed(config.investors[0].secret);
    const holderB = Wallet.fromSeed(config.investors[1].secret);

    console.log(`📋 Contas:`);
    console.log(`   Issuer: ${issuer.address}`);
    console.log(`   Holder A: ${holderA.address}`);
    console.log(`   Holder B: ${holderB.address}\n`);

    const currency = 'AUTH';
    const amount = '1000000'; // 10,000.00 tokens (2 decimais)
    const decimals = 2;

    // ============================================
    // STEP 1: Issue com flags requireAuth e canTransfer
    // ============================================
    {
      const step = '1. Issue MPT com requireAuth=true, canTransfer=true';
      console.log(`\n${step}...`);

      try {
        // Para MPTokens, requireAuth é configurado na conta issuer via AccountSet
        // Primeiro, configurar a conta para requerer autorização (se necessário)
        try {
          // Verificar se já está configurado
          const accountInfo = await client.request({
            command: 'account_info',
            account: issuer.address,
            ledger_index: 'validated',
          });

          const flags = accountInfo.result.account_data.Flags || 0;
          const requireAuthSet = (flags & 0x00000002) !== 0; // asfRequireAuth flag

          if (!requireAuthSet) {
            const accountSetTx = {
              TransactionType: 'AccountSet',
              Account: issuer.address,
              SetFlag: 2, // asfRequireAuth - Requer autorização para trustlines
            };
            
            const accountSetResult = await submitAndMeasureValidation(
              client,
              issuer,
              accountSetTx,
              'AccountSet: RequireAuth'
            );
            console.log(`   ✅ Conta configurada para requerer autorização (TX: ${accountSetResult.hash})`);
          } else {
            console.log(`   ℹ️  Conta já está configurada para requerer autorização`);
          }
        } catch (error: any) {
          // Continuar mesmo se houver erro (pode já estar configurado)
          console.log(`   ⚠️  Verificação de AccountSet: ${error.error || error.message}`);
        }

        // Criar token com Transferable=true (canTransfer)
        const transaction = {
          TransactionType: 'MPTokenIssuanceCreate',
          Account: issuer.address,
          Currency: currency,
          Amount: amount,
          Decimals: decimals,
          Transferable: true, // CanTransfer
        };

        const result = await submitAndMeasureValidation(
          client,
          issuer,
          transaction,
          step
        );

        const txResult: TransactionResult = {
          step,
          success: true,
          txHash: result.hash,
          payload: transaction,
          submitTime: result.submitTime,
          validatedTime: result.validatedTime,
          validationDuration: result.validationDuration,
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.summary.issue = txResult;
        report.statistics.total++;
        report.statistics.passed++;
        if (result.validationDuration) {
          report.statistics.validationLatencies.push(result.validationDuration);
        }

        console.log(`   ✅ Sucesso!`);
        console.log(`   📝 TX Hash: ${result.hash}`);
        console.log(`   ⏱️  Validação: ${result.validationDuration}ms`);
        console.log(`   📦 Payload:`, JSON.stringify(transaction, null, 2));
      } catch (error: any) {
        const txResult: TransactionResult = {
          step,
          success: false,
          error: error.error || error.message,
          payload: error.payload || {},
          submitTime: error.submitTime,
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.statistics.total++;
        report.statistics.failed++;

        console.log(`   ❌ Erro: ${error.error || error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 2: Authorize holder A
    // ============================================
    {
      const step = '2. Authorize holder A';
      console.log(`\n${step}...`);

      try {
        const transaction = {
          TransactionType: 'MPTokenAuthorize',
          Account: issuer.address,
          Currency: currency,
          Holder: holderA.address,
          Authorize: true,
        };

        const result = await submitAndMeasureValidation(
          client,
          issuer,
          transaction,
          step
        );

        const txResult: TransactionResult = {
          step,
          success: true,
          txHash: result.hash,
          payload: transaction,
          submitTime: result.submitTime,
          validatedTime: result.validatedTime,
          validationDuration: result.validationDuration,
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.summary.authorize = txResult;
        report.statistics.total++;
        report.statistics.passed++;
        if (result.validationDuration) {
          report.statistics.validationLatencies.push(result.validationDuration);
        }

        console.log(`   ✅ Sucesso!`);
        console.log(`   📝 TX Hash: ${result.hash}`);
        console.log(`   ⏱️  Validação: ${result.validationDuration}ms`);
        console.log(`   📦 Payload:`, JSON.stringify(transaction, null, 2));
      } catch (error: any) {
        const txResult: TransactionResult = {
          step,
          success: false,
          error: error.error || error.message,
          payload: error.payload || {},
          submitTime: error.submitTime,
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.statistics.total++;
        report.statistics.failed++;

        console.log(`   ❌ Erro: ${error.error || error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 3: Send 10 unidades para A (deve passar)
    // ============================================
    {
      const step = '3. Send 10 unidades para Holder A (deve passar)';
      console.log(`\n${step}...`);

      try {
        const tokenAmount = '1000'; // 10.00 tokens (2 decimais)

        const transaction = {
          TransactionType: 'Payment',
          Account: issuer.address,
          Destination: holderA.address,
          Amount: {
            currency: currency,
            issuer: issuer.address,
            value: tokenAmount,
          },
        };

        const result = await submitAndMeasureValidation(
          client,
          issuer,
          transaction,
          step
        );

        const txResult: TransactionResult = {
          step,
          success: true,
          txHash: result.hash,
          payload: transaction,
          submitTime: result.submitTime,
          validatedTime: result.validatedTime,
          validationDuration: result.validationDuration,
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.summary.sendToA = txResult;
        report.statistics.total++;
        report.statistics.passed++;
        if (result.validationDuration) {
          report.statistics.validationLatencies.push(result.validationDuration);
        }

        console.log(`   ✅ Sucesso! (Como esperado)`);
        console.log(`   📝 TX Hash: ${result.hash}`);
        console.log(`   ⏱️  Validação: ${result.validationDuration}ms`);
        console.log(`   📦 Payload:`, JSON.stringify(transaction, null, 2));
      } catch (error: any) {
        const txResult: TransactionResult = {
          step,
          success: false,
          error: error.error || error.message,
          payload: error.payload || {},
          submitTime: error.submitTime,
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.statistics.total++;
        report.statistics.failed++;

        console.log(`   ❌ Erro inesperado: ${error.error || error.message}`);
        throw error;
      }
    }

    // ============================================
    // STEP 4: Tentar enviar para B sem autorizar (deve falhar)
    // ============================================
    {
      const step = '4. Tentar enviar para Holder B sem autorizar (deve falhar)';
      console.log(`\n${step}...`);

      try {
        const tokenAmount = '1000'; // 10.00 tokens

        const transaction = {
          TransactionType: 'Payment',
          Account: issuer.address,
          Destination: holderB.address,
          Amount: {
            currency: currency,
            issuer: issuer.address,
            value: tokenAmount,
          },
        };

        const result = await submitAndMeasureValidation(
          client,
          issuer,
          transaction,
          step
        );

        // Se chegou aqui, a transação passou (não deveria!)
        const txResult: TransactionResult = {
          step,
          success: false, // Marcado como falha porque deveria ter falhado
          txHash: result.hash,
          payload: transaction,
          submitTime: result.submitTime,
          validatedTime: result.validatedTime,
          validationDuration: result.validationDuration,
          error: 'Transação passou quando deveria ter falhado (holder B não autorizado)',
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.summary.sendToBFailed = txResult;
        report.statistics.total++;
        report.statistics.failed++;

        console.log(`   ❌ FALHA DO TESTE: Transação passou quando deveria ter falhado!`);
        console.log(`   📝 TX Hash: ${result.hash}`);
        console.log(`   📦 Payload:`, JSON.stringify(transaction, null, 2));
      } catch (error: any) {
        // Esperado: transação deve falhar
        const errorMessage = error.error || error.message || String(error);
        const expectedError = errorMessage.includes('tecNO_AUTH') || 
                             errorMessage.includes('tecNO_PERMISSION') ||
                             errorMessage.includes('not authorized');

        const txResult: TransactionResult = {
          step,
          success: true, // Sucesso porque falhou como esperado
          error: errorMessage,
          payload: error.payload || {},
          submitTime: error.submitTime,
          timestamp: new Date().toISOString(),
        };

        report.results.push(txResult);
        report.summary.sendToBFailed = txResult;
        report.statistics.total++;
        
        if (expectedError) {
          report.statistics.passed++;
          console.log(`   ✅ Sucesso! (Falhou como esperado)`);
          console.log(`   📝 Erro esperado: ${errorMessage}`);
        } else {
          report.statistics.failed++;
          console.log(`   ⚠️  Falhou, mas com erro inesperado: ${errorMessage}`);
        }
        
        console.log(`   📦 Payload tentado:`, JSON.stringify(error.payload || {}, null, 2));
      }
    }

    // Calcular estatísticas de latência
    if (report.statistics.validationLatencies.length > 0) {
      const sorted = [...report.statistics.validationLatencies].sort((a, b) => a - b);
      const p95Index = Math.ceil(sorted.length * 0.95) - 1;
      const p99Index = Math.ceil(sorted.length * 0.99) - 1;
      
      report.statistics.p95 = sorted[Math.max(0, Math.min(p95Index, sorted.length - 1))];
      report.statistics.p99 = sorted[Math.max(0, Math.min(p99Index, sorted.length - 1))];
    }

    // Finalizar relatório
    report.endTime = new Date().toISOString();
    report.duration = Date.now() - new Date(report.startTime).getTime();

    // Exibir resumo
    console.log(`\n${'='.repeat(70)}`);
    console.log(`\n📊 Resumo do Teste:\n`);
    console.log(`   Total de steps: ${report.statistics.total}`);
    console.log(`   ✅ Passou: ${report.statistics.passed}`);
    console.log(`   ❌ Falhou: ${report.statistics.failed}`);
    
    if (report.statistics.validationLatencies.length > 0) {
      console.log(`\n⏱️  Estatísticas de Validação:`);
      console.log(`   Total de medições: ${report.statistics.validationLatencies.length}`);
      console.log(`   Mínima: ${Math.min(...report.statistics.validationLatencies)}ms`);
      console.log(`   Máxima: ${Math.max(...report.statistics.validationLatencies)}ms`);
      console.log(`   Média: ${(report.statistics.validationLatencies.reduce((a, b) => a + b, 0) / report.statistics.validationLatencies.length).toFixed(2)}ms`);
      console.log(`   P95: ${report.statistics.p95}ms`);
      console.log(`   P99: ${report.statistics.p99}ms`);
    }
    
    console.log(`\n⏱️  Duração total: ${(report.duration / 1000).toFixed(2)}s`);

    // Detalhes das transações
    console.log(`\n📝 Detalhes das Transações:\n`);
    
    if (report.summary.issue) {
      console.log(`   1. Issue:`);
      console.log(`      Hash: ${report.summary.issue.txHash}`);
      console.log(`      Validação: ${report.summary.issue.validationDuration}ms`);
    }
    
    if (report.summary.authorize) {
      console.log(`   2. Authorize:`);
      console.log(`      Hash: ${report.summary.authorize.txHash}`);
      console.log(`      Validação: ${report.summary.authorize.validationDuration}ms`);
    }
    
    if (report.summary.sendToA) {
      console.log(`   3. Send to A:`);
      console.log(`      Hash: ${report.summary.sendToA.txHash}`);
      console.log(`      Validação: ${report.summary.sendToA.validationDuration}ms`);
    }
    
    if (report.summary.sendToBFailed) {
      console.log(`   4. Send to B (deve falhar):`);
      if (report.summary.sendToBFailed.txHash) {
        console.log(`      Hash: ${report.summary.sendToBFailed.txHash}`);
        console.log(`      ⚠️  ERRO: Transação passou quando deveria falhar!`);
      } else {
        console.log(`      ✅ Falhou como esperado`);
        console.log(`      Erro: ${report.summary.sendToBFailed.error}`);
      }
    }

    // Salvar relatório
    const reportDir = path.join(process.cwd(), 'scripts', 'tests', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      `e2e-web3-auth-${network}-${Date.now()}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n💾 Relatório completo salvo em: ${reportPath}`);

    // Validação final
    if (report.statistics.failed > 0) {
      console.log(`\n⚠️  AVISO: Alguns testes falharam`);
    }

    if (report.summary.sendToBFailed?.txHash) {
      console.log(`\n🚨 CRÍTICO: Transação para B passou quando deveria falhar!`);
      console.log(`   Isso indica que a autorização não está funcionando corretamente.`);
      throw new Error('Falha de segurança: autorização não está funcionando');
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
    console.log('\n✨ Teste concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error);
    process.exit(1);
  });
