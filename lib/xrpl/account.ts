// Utilitários para consultar informações de conta na XRPL

import { Client } from 'xrpl';

type XRPLNetwork = 'testnet' | 'mainnet' | 'devnet';

const XRPL_ENDPOINTS: Record<XRPLNetwork, string> = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

async function withClient<T>(network: XRPLNetwork, handler: (client: Client) => Promise<T>) {
  const endpoint = XRPL_ENDPOINTS[network] ?? XRPL_ENDPOINTS.testnet;
  const client = new Client(endpoint);

  try {
    await client.connect();
    const result = await handler(client);
    await client.disconnect();
    return result;
  } catch (error) {
    await client.disconnect();
    throw error;
  }
}

/**
 * Obter informações de uma conta na XRPL
 */
export async function getAccountInfo(address: string, network: XRPLNetwork = 'testnet') {
  return withClient(network, async (client) => {
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });

    return response.result;
  });
}

/**
 * Obter tokens MPT de uma conta
 */
export async function getAccountMPTokens(address: string, network: XRPLNetwork = 'testnet') {
  return withClient(network, async (client) => {
    const accountLines = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    });

    return (
      accountLines.result.lines?.filter((line: any) => line.currency !== 'XRP') ?? []
    );
  });
}

/**
 * Obter saldo XRP de uma conta
 */
export async function getXRPBalance(address: string, network: XRPLNetwork = 'testnet') {
  return withClient(network, async (client) => {
    const accountInfo = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });

    const balanceDrops = accountInfo.result.account_data.Balance;
    return parseFloat(balanceDrops) / 1_000_000;
  });
}

