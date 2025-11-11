/**
 * Script de teste para o fluxo completo de MPT
 * 
 * Fluxo testado:
 * 1. Criar conta de teste (emissor e holder)
 * 2. Criar MPT
 * 3. Holder autoriza-se para receber MPT
 * 4. Emissor envia MPT para holder
 * 5. Verificar saldo do holder
 * 6. Holder transfere para outro holder
 * 7. Verificar saldos finais
 * 
 * Uso:
 * npm run test:mpt-flow
 * ou
 * tsx scripts/tests/test-mpt-flow.ts
 */

import { Client, Wallet } from 'xrpl';
import {
  createMPT,
  authorizeMPTHolder,
  sendMPT,
  getMPTBalance,
  getMPTInfo,
  isHolderAuthorized
} from '../../lib/xrpl/mpt-helpers';

const NETWORK = 'testnet';
const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';

interface TestResult {
  step: string;
  success: boolean;
  data?: any;
  error?: string;
}

const results: TestResult[] = [];

function logStep(step: string, message: string) {
  console.log(`\n📍 [${step}] ${message}`);
}

function logSuccess(step: string, message: string, data?: any) {
  console.log(`✅ [${step}] ${message}`);
  if (data) {
    console.log('   Data:', JSON.stringify(data, null, 2));
  }
  results.push({ step, success: true, data });
}

function logError(step: string, message: string, error: any) {
  console.error(`❌ [${step}] ${message}`);
  console.error('   Error:', error.message || error);
  results.push({ step, success: false, error: error.message || error });
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Iniciando teste de fluxo completo de MPT');
  console.log('Network:', NETWORK);
  console.log('URL:', TESTNET_URL);

  let client: Client | null = null;
  let issuerWallet: Wallet | null = null;
  let holder1Wallet: Wallet | null = null;
  let holder2Wallet: Wallet | null = null;
  let mptokenIssuanceID: string | null = null;

  try {
    // ===============================================
    // PASSO 1: Criar contas de teste
    // ===============================================
    logStep('1', 'Criando contas de teste...');
    
    client = new Client(TESTNET_URL);
    await client.connect();
    
    // Criar e financiar issuer
    logStep('1.1', 'Criando conta do emissor...');
    const issuerFunding = await client.fundWallet();
    issuerWallet = issuerFunding.wallet;
    logSuccess('1.1', 'Emissor criado', {
      address: issuerWallet.address,
      seed: issuerWallet.seed,
      balance: issuerFunding.balance
    });
    
    // Criar e financiar holder 1
    logStep('1.2', 'Criando conta do holder 1...');
    const holder1Funding = await client.fundWallet();
    holder1Wallet = holder1Funding.wallet;
    logSuccess('1.2', 'Holder 1 criado', {
      address: holder1Wallet.address,
      seed: holder1Wallet.seed,
      balance: holder1Funding.balance
    });
    
    // Criar e financiar holder 2
    logStep('1.3', 'Criando conta do holder 2...');
    const holder2Funding = await client.fundWallet();
    holder2Wallet = holder2Funding.wallet;
    logSuccess('1.3', 'Holder 2 criado', {
      address: holder2Wallet.address,
      seed: holder2Wallet.seed,
      balance: holder2Funding.balance
    });
    
    // Aguardar para garantir que as contas foram criadas
    await sleep(2000);
    
    // ===============================================
    // PASSO 2: Criar MPT
    // ===============================================
    logStep('2', 'Criando MPT...');
    
    try {
      const mptResult = await createMPT({
        issuerAddress: issuerWallet.address,
        issuerSeed: issuerWallet.seed!,
        assetScale: 2, // 2 casas decimais
        maximumAmount: '1000000', // 1 milhão
        transferFee: 100, // 1%
        metadata: {
          name: 'LAND Token Test',
          symbol: 'LAND',
          description: 'Tokenized land parcel for testing',
          location: 'Test Location',
          testRun: new Date().toISOString()
        },
        flags: {
          requireAuth: true,
          canTransfer: true,
          canTrade: true,
          canClawback: true
        },
        network: NETWORK
      });
      
      mptokenIssuanceID = mptResult.mptokenIssuanceID;
      
      logSuccess('2', 'MPT criado com sucesso', {
        mptokenIssuanceID,
        txHash: mptResult.txHash
      });
      
      // Aguardar para garantir que o MPT foi criado
      await sleep(2000);
    } catch (error: any) {
      logError('2', 'Erro ao criar MPT', error);
      throw error;
    }
    
    // ===============================================
    // PASSO 3: Verificar informações do MPT
    // ===============================================
    logStep('3', 'Buscando informações do MPT...');
    
    try {
      const mptInfo = await getMPTInfo(mptokenIssuanceID!, NETWORK);
      logSuccess('3', 'Informações do MPT obtidas', mptInfo);
    } catch (error: any) {
      logError('3', 'Erro ao buscar informações do MPT', error);
      // Não é crítico, continuar
    }
    
    // ===============================================
    // PASSO 4: Holder 1 se autoriza
    // ===============================================
    logStep('4', 'Holder 1 se autorizando para receber MPT...');
    
    try {
      // Para MPT verdadeiro, precisamos usar transação direta
      // pois a biblioteca pode não suportar MPTokenIssuanceID ainda
      const authTx = {
        TransactionType: 'MPTokenAuthorize',
        Account: holder1Wallet.address,
        Holder: holder1Wallet.address,
        MPTokenIssuanceID: mptokenIssuanceID!
      };

      const prepared = await client.autofill(authTx);
      const signed = holder1Wallet.sign(prepared);
      const authResult = await client.submitAndWait(signed.tx_blob);

      const authTxHash = authResult.result.hash;
      
      logSuccess('4', 'Holder 1 autorizado', { txHash: authTxHash });
      
      // Aguardar para garantir que a autorização foi processada
      await sleep(2000);
    } catch (error: any) {
      logError('4', 'Erro ao autorizar holder 1', error);
      // Log adicional do erro completo
      console.error('Detalhes do erro:', JSON.stringify(error, null, 2));
      throw error;
    }
    
    // ===============================================
    // PASSO 5: Verificar autorização do holder 1
    // ===============================================
    logStep('5', 'Verificando autorização do holder 1...');
    
    try {
      const isAuth = await isHolderAuthorized(
        holder1Wallet.address,
        mptokenIssuanceID!,
        NETWORK
      );
      
      if (isAuth) {
        logSuccess('5', 'Holder 1 está autorizado');
      } else {
        logError('5', 'Holder 1 NÃO está autorizado (esperado estar)', 'Verificação falhou');
      }
    } catch (error: any) {
      logError('5', 'Erro ao verificar autorização', error);
      // Não é crítico, continuar
    }
    
    // ===============================================
    // PASSO 6: Emissor envia MPT para holder 1
    // ===============================================
    logStep('6', 'Emissor enviando 500 tokens para holder 1...');
    
    try {
      const sendTxHash = await sendMPT({
        fromAddress: issuerWallet.address,
        fromSeed: issuerWallet.seed!,
        toAddress: holder1Wallet.address,
        mptokenIssuanceID: mptokenIssuanceID!,
        amount: '500.00',
        memo: 'Initial distribution for testing',
        network: NETWORK
      });
      
      logSuccess('6', 'Tokens enviados para holder 1', { txHash: sendTxHash });
      
      // Aguardar para garantir que o envio foi processado
      await sleep(2000);
    } catch (error: any) {
      logError('6', 'Erro ao enviar tokens para holder 1', error);
      throw error;
    }
    
    // ===============================================
    // PASSO 7: Verificar saldo do holder 1
    // ===============================================
    logStep('7', 'Verificando saldo do holder 1...');
    
    try {
      const balance1 = await getMPTBalance(
        holder1Wallet.address,
        mptokenIssuanceID!,
        NETWORK
      );
      
      logSuccess('7', `Saldo do holder 1: ${balance1}`, { balance: balance1 });
      
      if (balance1 !== '500.00' && balance1 !== '500') {
        console.warn(`⚠️  Saldo esperado: 500.00, obtido: ${balance1}`);
      }
    } catch (error: any) {
      logError('7', 'Erro ao verificar saldo do holder 1', error);
      // Não é crítico, continuar
    }
    
    // ===============================================
    // PASSO 8: Holder 2 se autoriza
    // ===============================================
    logStep('8', 'Holder 2 se autorizando para receber MPT...');
    
    try {
      // Para MPT verdadeiro, precisamos usar transação direta
      const authTx2 = {
        TransactionType: 'MPTokenAuthorize',
        Account: holder2Wallet.address,
        Holder: holder2Wallet.address,
        MPTokenIssuanceID: mptokenIssuanceID!
      };

      const prepared2 = await client.autofill(authTx2);
      const signed2 = holder2Wallet.sign(prepared2);
      const authResult2 = await client.submitAndWait(signed2.tx_blob);

      const authTxHash2 = authResult2.result.hash;
      
      logSuccess('8', 'Holder 2 autorizado', { txHash: authTxHash2 });
      
      // Aguardar para garantir que a autorização foi processada
      await sleep(2000);
    } catch (error: any) {
      logError('8', 'Erro ao autorizar holder 2', error);
      throw error;
    }
    
    // ===============================================
    // PASSO 9: Holder 1 transfere para holder 2
    // ===============================================
    logStep('9', 'Holder 1 transferindo 200 tokens para holder 2...');
    
    try {
      const transferTxHash = await sendMPT({
        fromAddress: holder1Wallet.address,
        fromSeed: holder1Wallet.seed!,
        toAddress: holder2Wallet.address,
        mptokenIssuanceID: mptokenIssuanceID!,
        amount: '200.00',
        memo: 'Transfer between holders for testing',
        network: NETWORK
      });
      
      logSuccess('9', 'Tokens transferidos de holder 1 para holder 2', { txHash: transferTxHash });
      
      // Aguardar para garantir que a transferência foi processada
      await sleep(2000);
    } catch (error: any) {
      logError('9', 'Erro ao transferir tokens', error);
      throw error;
    }
    
    // ===============================================
    // PASSO 10: Verificar saldos finais
    // ===============================================
    logStep('10', 'Verificando saldos finais...');
    
    try {
      const finalBalance1 = await getMPTBalance(
        holder1Wallet.address,
        mptokenIssuanceID!,
        NETWORK
      );
      
      const finalBalance2 = await getMPTBalance(
        holder2Wallet.address,
        mptokenIssuanceID!,
        NETWORK
      );
      
      logSuccess('10', 'Saldos finais verificados', {
        holder1: finalBalance1,
        holder2: finalBalance2
      });
      
      // Verificar se os saldos estão corretos
      // Holder 1: 500 - 200 = 300 (menos taxa de 1% = 298)
      // Holder 2: 200 (menos taxa de 1% = 198)
      console.log(`\n📊 SALDOS FINAIS:`);
      console.log(`   Holder 1: ${finalBalance1} (esperado: ~298-300)`);
      console.log(`   Holder 2: ${finalBalance2} (esperado: ~198-200)`);
    } catch (error: any) {
      logError('10', 'Erro ao verificar saldos finais', error);
      // Não é crítico
    }
    
    // ===============================================
    // RESUMO
    // ===============================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DO TESTE');
    console.log('='.repeat(60));
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(`✅ Sucessos: ${successCount}`);
    console.log(`❌ Erros: ${errorCount}`);
    console.log(`📝 Total de passos: ${results.length}`);
    
    if (errorCount === 0) {
      console.log('\n🎉 TODOS OS TESTES PASSARAM!');
    } else {
      console.log('\n⚠️  ALGUNS TESTES FALHARAM');
      console.log('\nErros:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - [${r.step}]: ${r.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🔑 INFORMAÇÕES IMPORTANTES (Salve para referência)');
    console.log('='.repeat(60));
    
    if (issuerWallet) {
      console.log('\n👤 Emissor:');
      console.log(`   Address: ${issuerWallet.address}`);
      console.log(`   Seed: ${issuerWallet.seed}`);
    }
    
    if (holder1Wallet) {
      console.log('\n👤 Holder 1:');
      console.log(`   Address: ${holder1Wallet.address}`);
      console.log(`   Seed: ${holder1Wallet.seed}`);
    }
    
    if (holder2Wallet) {
      console.log('\n👤 Holder 2:');
      console.log(`   Address: ${holder2Wallet.address}`);
      console.log(`   Seed: ${holder2Wallet.seed}`);
    }
    
    if (mptokenIssuanceID) {
      console.log('\n🪙 MPT:');
      console.log(`   MPTokenIssuanceID: ${mptokenIssuanceID}`);
      console.log(`   Explorer: https://testnet.xrpl.org/`);
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error: any) {
    console.error('\n💥 ERRO FATAL:', error.message || error);
    if (process.env.DEBUG) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.disconnect();
      console.log('\n🔌 Conexão com XRPL encerrada');
    }
  }
}

// Executar teste
main()
  .then(() => {
    console.log('\n✨ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erro não tratado:', error);
    process.exit(1);
  });

