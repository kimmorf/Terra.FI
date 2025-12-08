/**
 * Cliente XRPL simples - cria nova conexão a cada requisição
 * Mais estável em ambientes com problemas de websocket
 */

import { Client, Wallet } from 'xrpl';

export type XRPLNetwork = 'testnet' | 'mainnet' | 'devnet';

const XRPL_ENDPOINTS: Record<XRPLNetwork, string> = {
  mainnet: 'wss://xrplcluster.com',
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

export interface CreateMPTSimpleParams {
  issuerSeed: string;
  assetScale?: number;
  maximumAmount?: string;
  transferFee?: number;
  metadata?: Record<string, any>;
  flags?: {
    canTransfer?: boolean;
    requireAuth?: boolean;
    canClawback?: boolean;
    canLock?: boolean;
    canEscrow?: boolean;
    canTrade?: boolean;
  };
  network?: XRPLNetwork;
}

function flagsToInt(flags?: CreateMPTSimpleParams['flags']): number {
  if (!flags) return 0;
  
  let result = 0;
  if (flags.canLock) result |= 0x00000002;
  if (flags.requireAuth) result |= 0x00000004;
  if (flags.canEscrow) result |= 0x00000008;
  if (flags.canTrade) result |= 0x00000010;
  if (flags.canTransfer) result |= 0x00000020;
  if (flags.canClawback) result |= 0x00000040;
  
  return result;
}

function metadataToHex(metadata: Record<string, any>): string {
  const json = JSON.stringify(metadata);
  return Buffer.from(json, 'utf-8').toString('hex').toUpperCase();
}

/**
 * Cria um MPT com conexão nova (sem pool)
 */
export async function createMPTSimple(params: CreateMPTSimpleParams): Promise<{
  mptokenIssuanceID: string;
  txHash: string;
  issuerAddress: string;
}> {
  const {
    issuerSeed,
    assetScale = 0,
    maximumAmount = '0',
    transferFee = 0,
    metadata,
    flags,
    network = 'testnet'
  } = params;

  const endpoint = XRPL_ENDPOINTS[network];
  const client = new Client(endpoint);
  
  try {
    console.log(`[SimpleClient] Conectando a ${network} (${endpoint})...`);
    await client.connect();
    
    // Aguardar conexão estabilizar
    let attempts = 5;
    while (!client.isConnected() && attempts > 0) {
      await new Promise(r => setTimeout(r, 500));
      attempts--;
    }
    
    if (!client.isConnected()) {
      throw new Error('Não foi possível estabelecer conexão com a rede XRPL');
    }
    
    console.log(`[SimpleClient] Conectado com sucesso!`);

    // Criar wallet
    const wallet = Wallet.fromSeed(issuerSeed);
    console.log(`[SimpleClient] Wallet: ${wallet.classicAddress}`);

    // Preparar transação
    const transaction: Record<string, any> = {
      TransactionType: 'MPTokenIssuanceCreate',
      Account: wallet.classicAddress,
      AssetScale: assetScale,
      MaximumAmount: maximumAmount,
      TransferFee: transferFee,
    };

    // Adicionar flags
    const flagsValue = flagsToInt(flags);
    if (flagsValue > 0) {
      transaction.Flags = flagsValue;
    }

    // Adicionar metadados
    if (metadata) {
      transaction.MPTokenMetadata = metadataToHex(metadata);
    }

    console.log(`[SimpleClient] Preparando transação...`);

    // Autofill
    const prepared = await client.autofill(transaction);
    console.log(`[SimpleClient] Transação preparada - Sequence: ${prepared.Sequence}`);

    // Assinar
    const signed = wallet.sign(prepared as any);
    console.log(`[SimpleClient] Transação assinada - Hash: ${(signed as any).hash}`);

    // Submeter
    console.log(`[SimpleClient] Submetendo transação...`);
    const result = await client.submitAndWait(signed.tx_blob);
    
    // Verificar resultado
    const txResult = (result.result as any).meta?.TransactionResult || (result.result as any).engine_result;
    if (txResult && !txResult.startsWith('tes')) {
      throw new Error(`Transação falhou: ${txResult}`);
    }

    console.log(`[SimpleClient] Transação confirmada!`);

    // Extrair MPTokenIssuanceID
    let mptokenIssuanceID: string | undefined;
    const meta = (result.result as any).meta;
    
    if (meta && typeof meta === 'object') {
      mptokenIssuanceID = meta.MPTokenIssuanceID;
      
      if (!mptokenIssuanceID && meta.AffectedNodes) {
        for (const node of meta.AffectedNodes || []) {
          if (node.CreatedNode?.LedgerEntryType === 'MPTokenIssuance') {
            mptokenIssuanceID = 
              node.CreatedNode?.NewFields?.MPTokenIssuanceID ||
              node.CreatedNode?.LedgerIndex;
            break;
          }
        }
      }
    }

    if (!mptokenIssuanceID) {
      throw new Error('Não foi possível extrair MPTokenIssuanceID da resposta');
    }

    const txHash = (result.result as any).tx_json?.hash || (result.result as any).hash;

    console.log(`[SimpleClient] MPT criado! ID: ${mptokenIssuanceID}`);

    return {
      mptokenIssuanceID,
      txHash,
      issuerAddress: wallet.classicAddress,
    };
  } finally {
    // Sempre desconectar
    try {
      await client.disconnect();
    } catch {
      // Ignora erro ao desconectar
    }
  }
}

/**
 * Testa conexão com a rede XRPL
 */
export async function testConnection(network: XRPLNetwork = 'testnet'): Promise<{
  connected: boolean;
  ledgerIndex?: number;
  error?: string;
}> {
  const endpoint = XRPL_ENDPOINTS[network];
  const client = new Client(endpoint);
  
  try {
    console.log(`[SimpleClient] Testando conexão com ${network}...`);
    await client.connect();
    
    // Aguardar
    await new Promise(r => setTimeout(r, 1000));
    
    if (!client.isConnected()) {
      return { connected: false, error: 'Conexão não estabelecida' };
    }
    
    const serverInfo = await client.request({ command: 'server_info' } as any);
    const ledgerIndex = serverInfo.result?.info?.validated_ledger?.seq;
    
    console.log(`[SimpleClient] Conexão OK! Ledger: ${ledgerIndex}`);
    
    return { connected: true, ledgerIndex };
  } catch (error: any) {
    console.error(`[SimpleClient] Erro ao testar conexão:`, error.message);
    return { connected: false, error: error.message };
  } finally {
    try {
      await client.disconnect();
    } catch {
      // Ignora
    }
  }
}

