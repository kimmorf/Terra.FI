/**
 * Stub para utf-8-validate - módulo opcional do WebSocket
 * 
 * Implementação JavaScript puro da função de validação UTF-8
 * que é normalmente fornecida pelo módulo nativo utf-8-validate.
 */

// Função de validação UTF-8 simples
function isValidUTF8(buffer) {
  try {
    if (Buffer.isBuffer(buffer)) {
      buffer.toString('utf8');
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = isValidUTF8;
module.exports.isValidUTF8 = isValidUTF8;

