import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended 96 bits

/**
 * Obtém chave de criptografia do ambiente ou usa padrão para desenvolvimento
 * IMPORTANTE: Em produção, defina WALLET_ENCRYPTION_KEY no .env
 */
function getKey() {
  const secret = process.env.WALLET_ENCRYPTION_KEY || 'terra-fi-demo-shared-secret-used-for-encryption';
  
  // Log de aviso se usando chave padrão em produção
  if (process.env.NODE_ENV === 'production' && !process.env.WALLET_ENCRYPTION_KEY) {
    console.warn('[SECURITY] WALLET_ENCRYPTION_KEY não definida! Usando chave padrão (NÃO SEGURO)');
  }
  
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, authTagHex, encryptedHex] = payload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Formato de payload inválido para decryptSecret');
  }

  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}



