#!/usr/bin/env tsx
/**
 * Script de Setup de Contas de Teste
 * 
 * Cria e fundeia contas para testes:
 * - issuer_hot: Conta que emite tokens MPT
 * - admin: Conta administrativa
 * - investor1, investor2, investor3: Contas de investidores
 * 
 * Uso: tsx scripts/tests/setup-accounts.ts [--network=testnet|devnet]
 */

import { Client, Wallet, xrpToDrops, isValidClassicAddress } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';

const XRPL_ENDPOINTS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

const FAUCET_URLS = {
  testnet: 'https://faucet.altnet.rippletest.net/accounts',
  devnet: 'https://faucet.devnet.rippletest.net/accounts',
};

const MIN_RESERVE_XRP = 10; // XRP mínimo para ativar conta
const FUNDING_XRP = 1000; // XRP para fundear cada conta

interface TestAccount {
  name: string;
  address: string;
  secret: string;
  wallet: Wallet;
  balance?: number;
}

interface AccountsConfig {
  network: 'testnet' | 'devnet';
  issuer_hot: TestAccount;
  admin: TestAccount;
  investors: TestAccount[];
  createdAt: string;
}

/**
 * Solicita fundos do faucet XRPL
 */
async function fundAccountFromFaucet(
  address: string,
  network: 'testnet' | 'devnet'
): Promise<void> {
  const faucetUrl = FAUCET_URLS[network];
  
  console.log(`\n💰 Solicitando fundos do faucet para ${address}...`);
  
  try {
    const response = await fetch(faucetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: address,
        xrpAmount: String(FUNDING_XRP),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Faucet retornou ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log(`✅ Fundos solicitados. Resposta:`, data);
    
    // Aguardar alguns segundos para o ledger processar
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (error) {
    console.warn(`⚠️  Erro ao solicitar do faucet: ${error}`);
    console.log(`   Você pode solicitar manualmente em: ${faucetUrl}`);
  }
}

/**
 * Cria uma nova conta XRPL
 */
function generateAccount(): { address: string; secret: string; wallet: Wallet } {
  const wallet = Wallet.generate();
  return {
    address: wallet.classicAddress,
    secret: wallet.seed!,
    wallet,
  };
}

/**
 * Verifica saldo de uma conta
 */
async function getAccountBalance(
  client: Client,
  address: string
): Promise<number> {
  try {
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });

    const balanceDrops = response.result.account_data.Balance;
    return parseFloat(balanceDrops) / 1_000_000; // Converte drops para XRP
  } catch (error: any) {
    if (error?.data?.error === 'actNotFound') {
      return 0; // Conta não existe ainda
    }
    throw error;
  }
}

/**
 * Aguarda até a conta ter saldo suficiente
 */
async function waitForAccountFunded(
  client: Client,
  address: string,
  minBalance: number,
  maxWaitSeconds: number = 60
): Promise<number> {
  const startTime = Date.now();
  const maxWait = maxWaitSeconds * 1000;

  while (Date.now() - startTime < maxWait) {
    const balance = await getAccountBalance(client, address);
    
    if (balance >= minBalance) {
      return balance;
    }

    console.log(`   ⏳ Aguardando fundos... Saldo atual: ${balance.toFixed(2)} XRP`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`Timeout: Conta ${address} não foi fundeada em ${maxWaitSeconds}s`);
}

/**
 * Envia XRP de uma conta para outra
 */
async function sendXRP(
  client: Client,
  from: Wallet,
  to: string,
  amountXRP: number
): Promise<string> {
  const amountDrops = xrpToDrops(String(amountXRP));

  const response = await client.submitAndWait(
    {
      TransactionType: 'Payment',
      Account: from.classicAddress,
      Destination: to,
      Amount: amountDrops,
    },
    {
      wallet: from,
      autofill: true,
    }
  );

  return response.result.hash;
}

/**
 * Setup principal
 */
async function setupAccounts(network: 'testnet' | 'devnet' = 'testnet') {
  console.log(`\n🚀 Setup de Contas de Teste - ${network.toUpperCase()}\n`);
  console.log('='.repeat(60));

  const endpoint = XRPL_ENDPOINTS[network];
  const client = new Client(endpoint);

  try {
    await client.connect();
    console.log(`✅ Conectado ao ${network}`);

    // 1. Criar contas
    console.log('\n📝 Criando contas...');
    
    const issuer_hot = generateAccount();
    const admin = generateAccount();
    const investor1 = generateAccount();
    const investor2 = generateAccount();
    const investor3 = generateAccount();

    console.log(`   ✅ issuer_hot: ${issuer_hot.address}`);
    console.log(`   ✅ admin: ${admin.address}`);
    console.log(`   ✅ investor1: ${investor1.address}`);
    console.log(`   ✅ investor2: ${investor2.address}`);
    console.log(`   ✅ investor3: ${investor3.address}`);

    // 2. Solicitar fundos do faucet para todas as contas
    console.log('\n💰 Solicitando fundos do faucet...');
    
    await Promise.all([
      fundAccountFromFaucet(issuer_hot.address, network),
      fundAccountFromFaucet(admin.address, network),
      fundAccountFromFaucet(investor1.address, network),
      fundAccountFromFaucet(investor2.address, network),
      fundAccountFromFaucet(investor3.address, network),
    ]);

    // 3. Aguardar fundos e verificar saldos
    console.log('\n⏳ Aguardando confirmação dos fundos...');
    
    const [issuerBalance, adminBalance, inv1Balance, inv2Balance, inv3Balance] = 
      await Promise.all([
        waitForAccountFunded(client, issuer_hot.address, MIN_RESERVE_XRP),
        waitForAccountFunded(client, admin.address, MIN_RESERVE_XRP),
        waitForAccountFunded(client, investor1.address, MIN_RESERVE_XRP),
        waitForAccountFunded(client, investor2.address, MIN_RESERVE_XRP),
        waitForAccountFunded(client, investor3.address, MIN_RESERVE_XRP),
      ]);

    console.log('\n📊 Saldos finais:');
    console.log(`   issuer_hot: ${issuerBalance.toFixed(2)} XRP`);
    console.log(`   admin: ${adminBalance.toFixed(2)} XRP`);
    console.log(`   investor1: ${inv1Balance.toFixed(2)} XRP`);
    console.log(`   investor2: ${inv2Balance.toFixed(2)} XRP`);
    console.log(`   investor3: ${inv3Balance.toFixed(2)} XRP`);

    // 4. Preparar configuração
    const config: AccountsConfig = {
      network,
      issuer_hot: {
        name: 'issuer_hot',
        address: issuer_hot.address,
        secret: issuer_hot.secret,
        wallet: issuer_hot.wallet,
        balance: issuerBalance,
      },
      admin: {
        name: 'admin',
        address: admin.address,
        secret: admin.secret,
        wallet: admin.wallet,
        balance: adminBalance,
      },
      investors: [
        {
          name: 'investor1',
          address: investor1.address,
          secret: investor1.secret,
          wallet: investor1.wallet,
          balance: inv1Balance,
        },
        {
          name: 'investor2',
          address: investor2.address,
          secret: investor2.secret,
          wallet: investor2.wallet,
          balance: inv2Balance,
        },
        {
          name: 'investor3',
          address: investor3.address,
          secret: investor3.secret,
          wallet: investor3.wallet,
          balance: inv3Balance,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    // 5. Salvar configuração em arquivo
    const configDir = path.join(process.cwd(), 'scripts', 'tests', 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configPath = path.join(configDir, `accounts-${network}.json`);
    fs.writeFileSync(
      configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    console.log(`\n💾 Configuração salva em: ${configPath}`);

    // 6. Criar arquivo .env.example com as contas (sem secrets)
    const envExample = `# Contas de Teste - ${network.toUpperCase()}
# Gerado em: ${new Date().toISOString()}

ISSUER_HOT_ADDRESS=${issuer_hot.address}
ADMIN_ADDRESS=${admin.address}
INVESTOR1_ADDRESS=${investor1.address}
INVESTOR2_ADDRESS=${investor2.address}
INVESTOR3_ADDRESS=${investor3.address}

# ⚠️  SECRETS NÃO DEVEM SER COMMITADOS!
# Use o arquivo accounts-${network}.json para os secrets
`;

    const envPath = path.join(configDir, `.env.${network}.example`);
    fs.writeFileSync(envPath, envExample, 'utf-8');

    console.log(`\n✅ Setup concluído com sucesso!`);
    console.log(`\n📋 Resumo:`);
    console.log(`   Network: ${network}`);
    console.log(`   Contas criadas: 5`);
    console.log(`   Config salva: ${configPath}`);
    console.log(`\n⚠️  IMPORTANTE: Mantenha o arquivo ${configPath} seguro!`);
    console.log(`   Adicione-o ao .gitignore se ainda não estiver.`);

  } catch (error) {
    console.error('\n❌ Erro durante setup:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// Executar
const network = (process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet') as 'testnet' | 'devnet';

setupAccounts(network)
  .then(() => {
    console.log('\n✨ Pronto!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Falha no setup:', error);
    process.exit(1);
  });
