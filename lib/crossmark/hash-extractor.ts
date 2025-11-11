/**
 * Utilitário avançado para extrair hash de transações da Crossmark
 * Lida com diferentes estruturas de resposta do SDK
 */

/**
 * Extrai hash de transação da resposta da Crossmark
 * Explora recursivamente a estrutura para encontrar o hash
 */
export function extractHashRecursive(obj: any, depth: number = 0, maxDepth: number = 5): string | null {
  if (depth > maxDepth || !obj || typeof obj !== 'object') {
    return null;
  }

  // Procura por 'hash' diretamente
  if (typeof obj.hash === 'string' && obj.hash.length === 64) {
    return obj.hash;
  }

  // Procura em campos comuns
  const hashFields = [
    'hash',
    'txHash',
    'transactionHash',
    'tx_hash',
  ];

  for (const field of hashFields) {
    if (typeof obj[field] === 'string' && obj[field].length === 64) {
      return obj[field];
    }
  }

  // Procura em estruturas aninhadas comuns
  const nestedPaths = [
    'data.hash',
    'data.result.hash',
    'data.result.tx_json.hash',
    'data.tx_json.hash',
    'response.data.hash',
    'response.data.result.hash',
    'response.data.result.tx_json.hash',
    'response.response.data.hash',
    'response.response.data.result.hash',
    'result.hash',
    'tx_json.hash',
  ];

  for (const path of nestedPaths) {
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
    
    if (found && typeof current === 'string' && current.length === 64) {
      return current;
    }
  }

  // Recursivamente explora objetos aninhados
  if (depth < maxDepth) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
        const found = extractHashRecursive(obj[key], depth + 1, maxDepth);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Extrai hash com fallback para calcular do txBlob se necessário
 */
export async function extractHashWithFallback(response: any): Promise<string | null> {
  // Primeiro tenta extrair diretamente
  let hash = extractHashRecursive(response);
  
  if (hash) {
    return hash;
  }

  // Se não encontrou, tenta extrair txBlob e calcular hash
  const txBlob = extractTxBlobRecursive(response);
  
  if (txBlob) {
    try {
      // Tenta calcular hash do txBlob
      // Nota: xrpl não expõe computeTransactionHash diretamente
      // Mas podemos usar outras formas ou buscar na rede
      console.log('[extractHashWithFallback] txBlob encontrado, mas hash deve ser obtido da resposta ou rede');
      
      // Por enquanto, retorna null e deixa o código chamador lidar
      // O hash geralmente vem na resposta, este é apenas fallback
    } catch (error) {
      console.warn('[extractHashWithFallback] Erro ao processar txBlob:', error);
    }
  }

  return null;
}

/**
 * Extrai txBlob recursivamente
 */
function extractTxBlobRecursive(obj: any, depth: number = 0, maxDepth: number = 5): string | null {
  if (depth > maxDepth || !obj || typeof obj !== 'object') {
    return null;
  }

  if (typeof obj.txBlob === 'string') {
    return obj.txBlob;
  }

  if (typeof obj.tx_blob === 'string') {
    return obj.tx_blob;
  }

  // Procura em estruturas aninhadas
  const paths = [
    'data.txBlob',
    'data.tx_blob',
    'response.data.txBlob',
    'response.data.tx_blob',
    'result.txBlob',
    'result.tx_blob',
  ];

  for (const path of paths) {
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
    
    if (found && typeof current === 'string') {
      return current;
    }
  }

  // Recursivamente explora
  if (depth < maxDepth) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
        const found = extractTxBlobRecursive(obj[key], depth + 1, maxDepth);
        if (found) return found;
      }
    }
  }

  return null;
}
