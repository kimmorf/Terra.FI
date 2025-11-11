/**
 * Gerenciamento de RegularKey e política de uso issuer_hot
 * 
 * RegularKey permite delegar autoridade de assinatura para uma wallet "hot" (quente),
 * mantendo a wallet principal (cold) mais segura. A wallet hot pode executar
 * operações diárias, enquanto a cold fica offline para operações críticas.
 */

import { Client, isValidAddress } from 'xrpl';
import { xrplPool, type XRPLNetwork } from './pool';
import { withXRPLRetry } from '../utils/retry';
import { reliableSubmitV2 } from './reliable-submission-v2';

// Helper para validar endereço XRPL
function isValidXRPLAddress(address: string): boolean {
  return isValidAddress(address);
}

export interface RegularKeyConfig {
  /** Endereço da wallet principal (cold) */
  coldWallet: string;
  /** Endereço da wallet hot (RegularKey) */
  hotWallet: string;
  /** Rede XRPL */
  network: XRPLNetwork;
}

export interface RegularKeyStatus {
  /** Se a RegularKey está configurada */
  isConfigured: boolean;
  /** Endereço da RegularKey atual (se configurada) */
  regularKey?: string;
  /** Se a wallet hot tem saldo suficiente */
  hotWalletHasBalance: boolean;
  /** Saldo da wallet hot em XRP */
  hotWalletBalance: string;
}

/**
 * Verifica o status da RegularKey de uma conta
 */
export async function getRegularKeyStatus(
  account: string,
  network: XRPLNetwork = 'testnet'
): Promise<RegularKeyStatus> {
  if (!isValidXRPLAddress(account)) {
    throw new Error('Endereço XRPL inválido');
  }

  const result = await withXRPLRetry(async () => {
    const client = await xrplPool.getClient(network);
    const accountInfo = await client.request({
      command: 'account_info',
      account,
      ledger_index: 'validated',
    });

    const regularKey = accountInfo.result.account_data.RegularKey;
    const isConfigured = !!regularKey;

    // Se tem RegularKey, verifica saldo da wallet hot
    let hotWalletBalance = '0';
    let hotWalletHasBalance = false;

    if (regularKey) {
      const hotInfo = await client.request({
        command: 'account_info',
        account: regularKey,
        ledger_index: 'validated',
      });
      
      const balanceDrops = hotInfo.result.account_data.Balance;
      hotWalletBalance = balanceDrops;
      // Mínimo de 10 XRP para operar (reserva + taxas)
      hotWalletHasBalance = BigInt(balanceDrops) >= BigInt(10000000);
    }

    return {
      isConfigured,
      regularKey: regularKey || undefined,
      hotWalletHasBalance,
      hotWalletBalance,
    };
  }, { maxAttempts: 3 });

  return result;
}

/**
 * Configura RegularKey para uma conta (delegar para wallet hot)
 * 
 * ATENÇÃO: Esta operação requer a chave privada da wallet cold.
 * Em produção, deve ser executada manualmente ou com wallet offline.
 */
export async function setRegularKey(
  config: RegularKeyConfig,
  secret: string // Chave privada da wallet cold
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { coldWallet, hotWallet, network } = config;

  // Validações
  if (!isValidXRPLAddress(coldWallet)) {
    return { success: false, error: 'Endereço da wallet cold inválido' };
  }

  if (!isValidXRPLAddress(hotWallet)) {
    return { success: false, error: 'Endereço da wallet hot inválido' };
  }

  if (coldWallet === hotWallet) {
    return { success: false, error: 'Wallet cold e hot não podem ser iguais' };
  }

  try {
    const client = await xrplPool.getClient(network);

    // Verifica se a wallet hot existe e tem saldo mínimo
    const hotInfo = await client.request({
      command: 'account_info',
      account: hotWallet,
      ledger_index: 'validated',
    });

    const balanceDrops = hotInfo.result.account_data.Balance;
    if (BigInt(balanceDrops) < BigInt(10000000)) {
      return {
        success: false,
        error: 'Wallet hot precisa de pelo menos 10 XRP para operar',
      };
    }

    // Prepara transação SetRegularKey
    const transaction: any = {
      TransactionType: 'SetRegularKey',
      Account: coldWallet,
      RegularKey: hotWallet,
    };

    // Autofill
    const prepared = await client.autofill(transaction);

    // Assina com a chave privada da wallet cold
    const { Wallet } = await import('xrpl');
    const wallet = Wallet.fromSeed(secret);
    const signed = wallet.sign(prepared);

    // Submete transação
    const submitResult = await client.request({
      command: 'submit',
      tx_blob: signed.tx_blob,
    });
    
    // Aguarda validação
    await client.request({
      command: 'tx',
      transaction: submitResult.result.tx_json.hash,
    });

    if (submitResult.result.engine_result === 'tesSUCCESS') {
      return {
        success: true,
        txHash: submitResult.result.tx_json.hash,
      };
    } else {
      return {
        success: false,
        error: `Transação falhou: ${submitResult.result.engine_result}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Remove RegularKey (retorna controle total para wallet cold)
 * 
 * ATENÇÃO: Requer chave privada da wallet cold.
 */
export async function removeRegularKey(
  coldWallet: string,
  network: XRPLNetwork,
  secret: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!isValidXRPLAddress(coldWallet)) {
    return { success: false, error: 'Endereço da wallet cold inválido' };
  }

  try {
    const client = await xrplPool.getClient(network);

    const transaction: any = {
      TransactionType: 'SetRegularKey',
      Account: coldWallet,
      // RegularKey vazio remove a configuração
    };

    const prepared = await client.autofill(transaction);
    const { Wallet } = await import('xrpl');
    const wallet = Wallet.fromSeed(secret);
    const signed = wallet.sign(prepared);

    const submitResult = await reliableSubmitV2(signed.tx_blob, network, {
      maxRetries: 3,
    });

    if (submitResult.success && submitResult.txHash) {
      return {
        success: true,
        txHash: submitResult.txHash,
      };
    } else {
      return {
        success: false,
        error: submitResult.error || `Transação falhou: ${submitResult.engineResult}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Política de uso issuer_hot
 * 
 * Define quais operações podem ser executadas pela wallet hot vs cold.
 */
export enum IssuerOperation {
  /** Emissão de tokens - apenas cold */
  ISSUANCE = 'issuance',
  /** Autorização de holders - hot permitido */
  AUTHORIZE = 'authorize',
  /** Freeze de tokens - apenas cold */
  FREEZE = 'freeze',
  /** Clawback de tokens - apenas cold */
  CLAWBACK = 'clawback',
  /** Pagamentos - hot permitido */
  PAYMENT = 'payment',
  /** TrustSet - hot permitido */
  TRUSTSET = 'trustset',
}

/**
 * Verifica se uma operação pode ser executada pela wallet hot
 */
export function canHotWalletExecute(operation: IssuerOperation): boolean {
  const hotAllowed = [
    IssuerOperation.AUTHORIZE,
    IssuerOperation.PAYMENT,
    IssuerOperation.TRUSTSET,
  ];

  return hotAllowed.includes(operation);
}

/**
 * Valida se a wallet que está executando a operação é apropriada
 */
export async function validateIssuerWallet(
  issuer: string,
  executingWallet: string,
  operation: IssuerOperation,
  network: XRPLNetwork = 'testnet'
): Promise<{ valid: boolean; error?: string }> {
  if (!isValidXRPLAddress(issuer) || !isValidXRPLAddress(executingWallet)) {
    return { valid: false, error: 'Endereço inválido' };
  }

  // Se é a wallet cold, sempre permitido
  if (issuer === executingWallet) {
    return { valid: true };
  }

  // Verifica se executingWallet é a RegularKey da issuer
  const status = await getRegularKeyStatus(issuer, network);
  
  if (!status.isConfigured || status.regularKey !== executingWallet) {
    return {
      valid: false,
      error: 'Wallet executora não é a RegularKey configurada',
    };
  }

  // Verifica se a operação é permitida para hot wallet
  if (!canHotWalletExecute(operation)) {
    return {
      valid: false,
      error: `Operação ${operation} requer wallet cold (não pode ser executada por RegularKey)`,
    };
  }

  // Verifica se hot wallet tem saldo suficiente
  if (!status.hotWalletHasBalance) {
    return {
      valid: false,
      error: 'Wallet hot não tem saldo suficiente para operar',
    };
  }

  return { valid: true };
}
