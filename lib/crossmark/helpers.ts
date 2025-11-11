/**
 * Helpers para assinatura de transações com Crossmark
 */

import { getCrossmarkSDK } from './sdk';

export type Signer = (tx: any) => Promise<string>; // retorna tx_blob

/**
 * Assina transação preparada usando Crossmark
 */
export async function crossmarkSign(preparedTx: any): Promise<string> {
  const sdk = getCrossmarkSDK();
  
  if (!sdk) {
    throw new Error('Crossmark SDK indisponível. Certifique-se de que a extensão está instalada.');
  }

  if (!sdk.async.signAndSubmitAndWait) {
    throw new Error('A versão atual da Crossmark não suporta signAndSubmitAndWait.');
  }

  // Prepara a transação para o formato esperado pelo Crossmark
  const response = await sdk.async.signAndSubmitAndWait({
    tx_json: preparedTx,
    autofill: false, // Já vem preparado
    failHard: true,
  });

  if (!response) {
    throw new Error('Não foi possível obter resposta da Crossmark.');
  }

  // Extrai o tx_blob da resposta
  const txBlob = 
    (response as any)?.data?.tx_blob ??
    (response as any)?.tx_blob ??
    null;

  if (!txBlob) {
    throw new Error('Crossmark não retornou tx_blob da transação assinada.');
  }

  return txBlob;
}

/**
 * Prepara e assina transação com Crossmark (assina e submete)
 * Usa signAndSubmitAndWait do Crossmark que já submete automaticamente
 */
export async function crossmarkSignAndSubmit(preparedTx: any): Promise<{
  txHash: string;
  meta?: any;
}> {
  const sdk = getCrossmarkSDK();
  
  if (!sdk) {
    throw new Error('Crossmark SDK indisponível.');
  }

  if (!sdk.async.signAndSubmitAndWait) {
    throw new Error('A versão atual da Crossmark não suporta signAndSubmitAndWait.');
  }

  // Crossmark faz autofill, assina e submete automaticamente
  const response = await sdk.async.signAndSubmitAndWait({
    tx_json: preparedTx,
    autofill: true, // Crossmark faz autofill
    failHard: true,
  });

  if (!response) {
    throw new Error('Não foi possível obter resposta da Crossmark.');
  }

  // Extrai hash da resposta
  const txHash = 
    (response as any)?.data?.hash ??
    (response as any)?.data?.result?.hash ??
    (response as any)?.hash ??
    (response as any)?.response?.hash ??
    null;

  if (!txHash) {
    throw new Error('Não foi possível obter hash da transação.');
  }

  // Verifica status
  const status = 
    (response as any)?.data?.result?.engine_result ??
    (response as any)?.data?.engine_result ??
    (response as any)?.engine_result;
    
  if (status && !status.startsWith('tes')) {
    throw new Error(`Transação falhou: ${status}`);
  }

  return {
    txHash,
    meta: (response as any)?.data?.result?.meta ?? (response as any)?.data?.meta,
  };
}
