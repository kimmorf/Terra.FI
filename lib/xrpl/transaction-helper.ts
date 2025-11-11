/**
 * Helper para preparar e assinar transações antes de submeter
 */

import { Client, Wallet } from 'xrpl';
import { xrplPool, type XRPLNetwork } from './pool';

/**
 * Prepara, autofill e assina uma transação
 */
export async function prepareAndSignTransaction(
  transaction: Record<string, unknown>,
  issuerSeed: string,
  network: XRPLNetwork = 'testnet'
): Promise<string> {
  const client = await xrplPool.getClient(network);
  
  try {
    // Autofill
    const prepared = await client.autofill(transaction);
    
    // Assina
    const wallet = Wallet.fromSeed(issuerSeed);
    const signed = wallet.sign(prepared);
    
    return signed.tx_blob;
  } finally {
    // Não desconecta - pool gerencia conexões
  }
}
