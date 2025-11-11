/**
 * Stub para bufferutil - módulo opcional do WebSocket
 * 
 * Implementação JavaScript puro das funções mask e unmask
 * que são normalmente fornecidas pelo módulo nativo bufferutil.
 * 
 * O ws verifica se bufferutil existe e usa suas funções se disponíveis.
 * Este stub fornece implementações JavaScript puro que funcionam da mesma forma.
 */

// Implementação JavaScript puro da função mask
function mask(buffer, maskValue) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return buffer;
  }
  
  const length = buffer.length;
  const maskBytes = Buffer.allocUnsafe(4);
  maskBytes.writeUInt32BE(maskValue, 0);
  
  for (let i = 0; i < length; i++) {
    buffer[i] ^= maskBytes[i % 4];
  }
  
  return buffer;
}

// Implementação JavaScript puro da função unmask
function unmask(buffer, maskValue) {
  return mask(buffer, maskValue); // unmask é o mesmo que mask
}

// Exportar como objeto com as funções
const bufferUtil = {
  mask,
  unmask
};

// Exportar também as funções diretamente
module.exports = bufferUtil;
module.exports.mask = mask;
module.exports.unmask = unmask;

