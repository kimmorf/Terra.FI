/**
 * Setup de ambiente testnet para testes E2E
 * Cria contas, faz funding via faucet, configura trustlines
 */

import { Client, Wallet } from 'xrpl';
import { dropsToXrp } from '@/lib/utils/xrp-converter';

const TESTNET_ENDPOINT = 'wss://s.altnet.rippletest.net:51233';
const FAUCET_URL = 'https://faucet.altnet.rippletest.net/accounts';

export interface TestAccount {
  address: string;
  secret: string;
  wallet: Wallet;
  balance?: number;
}

export interface TestEnvironment {
  issuer: TestAccount;
  treasury: TestAccount;
  investorA: TestAccount;
  investorB: TestAccount;
  investorC: TestAccount;
  client: Client;
}

/**
 * Cria uma nova conta no testnet via faucet
 */
export async function createTestAccount(): Promise<TestAccount> {
  const client = new Client(TESTNET_ENDPOINT);
  await client.connect();

  try {
    // Gera nova wallet
    const wallet = Wallet.generate();
    
    // Faz funding via faucet
    const response = await fetch(FAUCET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: wallet.classicAddress,
        xrpAmount: '1000',
      }),
    });

    if (!response.ok) {
      throw new Error(`Faucet failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Aguarda confirmação
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verifica saldo
    const accountInfo = await client.request({
      command: 'account_info',
      account: wallet.classicAddress,
      ledger_index: 'validated',
    });

    const balanceDrops = accountInfo.result.account_data.Balance;
    const balance = parseFloat(dropsToXrp(balanceDrops));

    return {
      address: wallet.classicAddress,
      secret: wallet.seed!,
      wallet,
      balance,
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * Verifica e faz funding de uma conta se necessário
 */
export async function ensureAccountFunded(
  address: string,
  minBalance: number = 100
): Promise<number> {
  const client = new Client(TESTNET_ENDPOINT);
  await client.connect();

  try {
    const accountInfo = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });

    const balanceDrops = accountInfo.result.account_data.Balance;
    const balance = parseFloat(dropsToXrp(balanceDrops));

    if (balance < minBalance) {
      // Faz funding via faucet
      const response = await fetch(FAUCET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: address,
          xrpAmount: '1000',
        }),
      });

      if (!response.ok) {
        throw new Error(`Faucet failed: ${response.statusText}`);
      }

      // Aguarda confirmação
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verifica novo saldo
      const newAccountInfo = await client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated',
      });

      const newBalanceDrops = newAccountInfo.result.account_data.Balance;
      return parseFloat(dropsToXrp(newBalanceDrops));
    }

    return balance;
  } finally {
    await client.disconnect();
  }
}

/**
 * Setup completo do ambiente de testes
 */
export async function setupTestEnvironment(): Promise<TestEnvironment> {
  console.log('[Setup] Criando ambiente de testes...');

  const client = new Client(TESTNET_ENDPOINT);
  await client.connect();

  try {
    // Cria contas
    console.log('[Setup] Criando contas testnet...');
    const issuer = await createTestAccount();
    const treasury = await createTestAccount();
    const investorA = await createTestAccount();
    const investorB = await createTestAccount();
    const investorC = await createTestAccount();

    console.log('[Setup] Contas criadas:');
    console.log(`  Issuer: ${issuer.address} (${issuer.balance} XRP)`);
    console.log(`  Treasury: ${treasury.address} (${treasury.balance} XRP)`);
    console.log(`  Investor A: ${investorA.address} (${investorA.balance} XRP)`);
    console.log(`  Investor B: ${investorB.address} (${investorB.balance} XRP)`);
    console.log(`  Investor C: ${investorC.address} (${investorC.balance} XRP)`);

    // Verifica saldos mínimos
    const minBalance = 100;
    await ensureAccountFunded(issuer.address, minBalance);
    await ensureAccountFunded(treasury.address, minBalance);
    await ensureAccountFunded(investorA.address, minBalance);
    await ensureAccountFunded(investorB.address, minBalance);
    await ensureAccountFunded(investorC.address, minBalance);

    return {
      issuer,
      treasury,
      investorA,
      investorB,
      investorC,
      client,
    };
  } catch (error) {
    await client.disconnect();
    throw error;
  }
}

/**
 * Limpa ambiente de testes (desconecta client)
 */
export async function cleanupTestEnvironment(env: TestEnvironment): Promise<void> {
  if (env.client.isConnected()) {
    await env.client.disconnect();
  }
}
