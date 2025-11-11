/**
 * Utilitário para extrair MPTokenIssuanceID da resposta da Crossmark
 * Após emissão de MPTokenIssuanceCreate
 */

import { xrplPool, type XRPLNetwork } from '../xrpl/pool';

/**
 * Extrai MPTokenIssuanceID do meta da transação
 * Tenta múltiplos caminhos na estrutura do meta
 */
export function extractIssuanceIDFromMeta(meta: any): string | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  // Tentar extrair diretamente
  if (typeof meta.MPTokenIssuanceID === 'string') {
    return meta.MPTokenIssuanceID;
  }

  // Buscar em AffectedNodes
  if (Array.isArray(meta.AffectedNodes)) {
    for (const node of meta.AffectedNodes) {
      // CreatedNode para MPTokenIssuance
      if (node.CreatedNode?.LedgerEntryType === 'MPTokenIssuance') {
        const issuanceId = node.CreatedNode?.NewFields?.MPTokenIssuanceID;
        if (typeof issuanceId === 'string') {
          return issuanceId;
        }
      }

      // ModifiedNode também pode conter o ID
      if (node.ModifiedNode?.LedgerEntryType === 'MPTokenIssuance') {
        const issuanceId = node.ModifiedNode?.FinalFields?.MPTokenIssuanceID ||
                          node.ModifiedNode?.PreviousFields?.MPTokenIssuanceID;
        if (typeof issuanceId === 'string') {
          return issuanceId;
        }
      }
    }
  }

  return null;
}

/**
 * Extrai MPTokenIssuanceID recursivamente da resposta da Crossmark
 */
export function extractIssuanceIDRecursive(obj: any, depth: number = 0, maxDepth: number = 5): string | null {
  if (depth > maxDepth || !obj || typeof obj !== 'object') {
    return null;
  }

  // Tentar extrair do meta diretamente
  if (obj.meta) {
    const id = extractIssuanceIDFromMeta(obj.meta);
    if (id) return id;
  }

  // Caminhos comuns na resposta da Crossmark
  const metaPaths = [
    'data.meta',
    'data.result.meta',
    'response.data.meta',
    'response.data.result.meta',
    'response.response.data.meta',
    'response.response.data.result.meta',
    'result.meta',
  ];

  for (const path of metaPaths) {
    const parts = path.split('.');
    let current = obj;
    let found = true;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        found = false;
        break;
      }
    }

    if (found && current) {
      const id = extractIssuanceIDFromMeta(current);
      if (id) return id;
    }
  }

  // Recursivamente explora objetos aninhados
  if (depth < maxDepth) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
        const found = extractIssuanceIDRecursive(obj[key], depth + 1, maxDepth);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Busca MPTokenIssuanceID na XRPL usando o hash da transação
 * Útil quando a resposta da Crossmark não contém o meta completo
 */
export async function fetchIssuanceIDFromXRPL(
  txHash: string,
  network: XRPLNetwork = 'testnet'
): Promise<string | null> {
  try {
    const client = await xrplPool.getClient(network);
    const response = await client.request({
      command: 'tx',
      transaction: txHash,
      binary: false,
    });

    const meta = response.result.meta || response.result.MetaData;
    if (meta) {
      return extractIssuanceIDFromMeta(meta);
    }

    return null;
  } catch (error) {
    console.warn('[fetchIssuanceIDFromXRPL] Erro ao buscar transação:', error);
    return null;
  }
}

/**
 * Extrai MPTokenIssuanceID com fallback para buscar na XRPL
 */
export async function extractIssuanceIDWithFallback(
  response: any,
  txHash: string | null,
  network: XRPLNetwork = 'testnet'
): Promise<string | null> {
  // Primeiro tenta extrair da resposta
  let issuanceId = extractIssuanceIDRecursive(response);

  if (issuanceId) {
    return issuanceId;
  }

  // Se não encontrou e temos o hash, busca na XRPL
  if (txHash) {
    issuanceId = await fetchIssuanceIDFromXRPL(txHash, network);
  }

  return issuanceId;
}
