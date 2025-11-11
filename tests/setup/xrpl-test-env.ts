/**
 * Ambiente de Testes XRPL
 * Scripts de faucet, criação de contas, funding, trustlines/MPT setup
 */

import { Client, Wallet, xrpToDrops } from 'xrpl';

export interface TestAccount {
  address: string;
  secret: string;
  wallet: Wallet;
  balance: string;
}

export interface TestEnvironment {
  issuer: TestAccount;
  holder1: TestAccount;
  holder2: TestAccount;
  client: Client;
  network: 'testnet' | 'devnet';
}

const TESTNET_ENDPOINT = 'wss://s.altnet.rippletest.net:51233';
const DEVNET_ENDPOINT = 'wss://s.devnet.rippletest.net:51233';

/**
 * Cria conta de teste na XRPL
 */
export async function createTestAccount(
  client: Client,
  network: 'testnet' | 'devnet' = 'testnet'
): Promise<TestAccount> {
  const wallet = Wallet.generate();
  
  // Funda conta via faucet
  const faucetUrl =
    network === 'testnet'
      ? 'https://faucet.altnet.rippletest.net/accounts'
      : 'https://faucet.devnet.rippletest.net/accounts';

  try {
    const response = await fetch(faucetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: wallet.classicAddress }),
    });

    if (!response.ok) {
      throw new Error(`Faucet failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Aguarda funding
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verifica saldo
    const accountInfo = await client.request({
      command: 'account_info',
      account: wallet.classicAddress,
      ledger_index: 'validated',
    });

    return {
      address: wallet.classicAddress,
      secret: wallet.seed!,
      wallet,
      balance: accountInfo.result.account_data.Balance,
    };
  } catch (error) {
    throw new Error(`Failed to create test account: ${error}`);
  }
}

/**
 * Funda conta com XRP
 */
export async function fundAccount(
  client: Client,
  destination: string,
  amount: string
): Promise<string> {
  // Para testes, usa faucet ou transfer de conta de teste
  const faucetUrl = 'https://faucet.altnet.rippletest.net/accounts';
  
  const response = await fetch(faucetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination }),
  });

  if (!response.ok) {
    throw new Error(`Faucet funding failed: ${response.statusText}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));
  return 'funded';
}

/**
 * Cria trustline para MPT
 */
export async function createTrustline(
  client: Client,
  wallet: Wallet,
  currency: string,
  issuer: string,
  limit: string = '1000000000'
): Promise<string> {
  const trustSet = {
    TransactionType: 'TrustSet',
    Account: wallet.classicAddress,
    LimitAmount: {
      currency: currency.toUpperCase(),
      issuer,
      value: limit,
    },
  };

  const prepared = await client.autofill(trustSet);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`TrustSet failed: ${result.result.meta?.TransactionResult}`);
  }

  return result.result.hash;
}

/**
 * Setup completo do ambiente de testes
 */
export async function setupTestEnvironment(
  network: 'testnet' | 'devnet' = 'testnet'
): Promise<TestEnvironment> {
  const endpoint = network === 'testnet' ? TESTNET_ENDPOINT : DEVNET_ENDPOINT;
  const client = new Client(endpoint);

  await client.connect();

  try {
    // Cria contas de teste
    const issuer = await createTestAccount(client, network);
    const holder1 = await createTestAccount(client, network);
    const holder2 = await createTestAccount(client, network);

    // Funda contas adicionais se necessário
    await fundAccount(client, issuer.address, '1000');
    await fundAccount(client, holder1.address, '1000');
    await fundAccount(client, holder2.address, '1000');

    return {
      issuer,
      holder1,
      holder2,
      client,
      network,
    };
  } catch (error) {
    await client.disconnect();
    throw error;
  }
}

/**
 * Limpa ambiente de testes (opcional)
 */
export async function cleanupTestEnvironment(env: TestEnvironment): Promise<void> {
  await env.client.disconnect();
}

/**
 * Aguarda validação de ledger
 */
export async function waitForLedgerClose(
  client: Client,
  timeout: number = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkLedger = async () => {
      try {
        const ledger = await client.request({
          command: 'ledger',
          ledger_index: 'validated',
        });

        if (ledger.result.ledger) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for ledger close'));
        } else {
          setTimeout(checkLedger, 1000);
        }
      } catch (error) {
        if (Date.now() - startTime > timeout) {
          reject(error);
        } else {
          setTimeout(checkLedger, 1000);
        }
      }
    };

    checkLedger();
  });
}
