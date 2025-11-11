/**
 * Segurança para webhooks de oráculo
 * 
 * Implementa:
 * - HMAC para verificar autenticidade
 * - Nonce para prevenir replay attacks
 * - TTL (Time To Live) para validar que requisição não é antiga
 * - Rate limiting básico
 */

import { createHmac, timingSafeEqual } from 'crypto';

export interface WebhookSecurityConfig {
  /** Secret compartilhado para HMAC */
  secret: string;
  /** TTL máximo em segundos (padrão: 300 = 5 minutos) */
  ttlSeconds?: number;
  /** Rate limit: requisições por minuto por IP */
  rateLimitPerMinute?: number;
}

interface NonceRecord {
  nonce: string;
  timestamp: number;
  expiresAt: number;
}

/**
 * Cache simples de nonces usados (em produção, usar Redis)
 */
class NonceCache {
  private nonces: Map<string, NonceRecord> = new Map();
  private readonly CLEANUP_INTERVAL = 60000; // 1 minuto

  constructor() {
    // Limpa nonces expirados periodicamente
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  add(nonce: string, ttl: number): boolean {
    const now = Date.now();
    const expiresAt = now + ttl * 1000;

    // Se nonce já existe e não expirou, é replay
    const existing = this.nonces.get(nonce);
    if (existing && existing.expiresAt > now) {
      return false;
    }

    this.nonces.set(nonce, {
      nonce,
      timestamp: now,
      expiresAt,
    });

    return true;
  }

  has(nonce: string): boolean {
    const record = this.nonces.get(nonce);
    if (!record) return false;

    // Se expirou, remove e retorna false
    if (Date.now() > record.expiresAt) {
      this.nonces.delete(nonce);
      return false;
    }

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [nonce, record] of this.nonces.entries()) {
      if (now > record.expiresAt) {
        this.nonces.delete(nonce);
      }
    }
  }
}

const nonceCache = new NonceCache();

/**
 * Rate limiter simples por IP (em produção, usar Redis/Upstash)
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly CLEANUP_INTERVAL = 60000; // 1 minuto

  constructor() {
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  check(ip: string, limit: number): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // Último minuto

    let requests = this.requests.get(ip) || [];
    
    // Remove requisições antigas
    requests = requests.filter(timestamp => timestamp > windowStart);

    // Verifica limite
    if (requests.length >= limit) {
      return false;
    }

    // Adiciona nova requisição
    requests.push(now);
    this.requests.set(ip, requests);

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - 60000;

    for (const [ip, requests] of this.requests.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      if (validRequests.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, validRequests);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

/**
 * Gera HMAC SHA-256 de um payload
 */
export function generateHMAC(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verifica HMAC de forma segura (timing-safe)
 */
export function verifyHMAC(
  payload: string,
  secret: string,
  receivedHMAC: string
): boolean {
  const expectedHMAC = generateHMAC(payload, secret);

  // Comparação timing-safe para prevenir timing attacks
  if (expectedHMAC.length !== receivedHMAC.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(expectedHMAC),
      Buffer.from(receivedHMAC)
    );
  } catch {
    return false;
  }
}

/**
 * Gera nonce único
 */
export function generateNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Valida nonce (previne replay attacks)
 */
export function validateNonce(nonce: string, ttl: number): boolean {
  if (!nonce || typeof nonce !== 'string') {
    return false;
  }

  // Verifica se nonce já foi usado
  if (nonceCache.has(nonce)) {
    return false;
  }

  // Adiciona nonce ao cache
  return nonceCache.add(nonce, ttl);
}

/**
 * Valida timestamp (TTL)
 */
export function validateTimestamp(timestamp: number, ttlSeconds: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;

  // Timestamp não pode ser do futuro (com margem de 60s para clock skew)
  if (timestamp > now + 60) {
    return false;
  }

  // Timestamp não pode ser muito antigo
  if (age > ttlSeconds) {
    return false;
  }

  return true;
}

/**
 * Extrai IP do request (suporta proxies)
 */
export function extractIP(headers: Record<string, string | string[] | undefined>): string {
  // Verifica X-Forwarded-For (primeiro IP é o cliente real)
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }

  // Verifica X-Real-IP
  const realIP = headers['x-real-ip'];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  return 'unknown';
}

/**
 * Validação completa de webhook
 */
export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  code?: 'INVALID_HMAC' | 'INVALID_NONCE' | 'INVALID_TIMESTAMP' | 'RATE_LIMITED';
}

export function validateWebhook(
  body: string,
  headers: Record<string, string | string[] | undefined>,
  config: WebhookSecurityConfig
): WebhookValidationResult {
  const {
    secret,
    ttlSeconds = 300, // 5 minutos padrão
    rateLimitPerMinute = 60, // 60 req/min padrão
  } = config;

  // 1. Rate limiting
  const ip = extractIP(headers);
  if (!rateLimiter.check(ip, rateLimitPerMinute)) {
    return {
      valid: false,
      error: 'Rate limit excedido',
      code: 'RATE_LIMITED',
    };
  }

  // 2. Extrai headers de segurança
  const hmac = headers['x-webhook-hmac'] || headers['X-Webhook-HMAC'];
  const nonce = headers['x-webhook-nonce'] || headers['X-Webhook-Nonce'];
  const timestamp = headers['x-webhook-timestamp'] || headers['X-Webhook-Timestamp'];

  if (!hmac || !nonce || !timestamp) {
    return {
      valid: false,
      error: 'Headers de segurança ausentes (x-webhook-hmac, x-webhook-nonce, x-webhook-timestamp)',
      code: 'INVALID_HMAC',
    };
  }

  const hmacStr = Array.isArray(hmac) ? hmac[0] : hmac;
  const nonceStr = Array.isArray(nonce) ? nonce[0] : nonce;
  const timestampStr = Array.isArray(timestamp) ? timestamp[0] : timestamp;

  // 3. Valida timestamp (TTL)
  const timestampNum = parseInt(timestampStr, 10);
  if (isNaN(timestampNum)) {
    return {
      valid: false,
      error: 'Timestamp inválido',
      code: 'INVALID_TIMESTAMP',
    };
  }

  if (!validateTimestamp(timestampNum, ttlSeconds)) {
    return {
      valid: false,
      error: 'Timestamp expirado ou inválido',
      code: 'INVALID_TIMESTAMP',
    };
  }

  // 4. Valida nonce
  if (!validateNonce(nonceStr, ttlSeconds)) {
    return {
      valid: false,
      error: 'Nonce inválido ou já usado (replay attack)',
      code: 'INVALID_NONCE',
    };
  }

  // 5. Valida HMAC
  // Payload para HMAC: timestamp + nonce + body
  const payloadForHMAC = `${timestampStr}:${nonceStr}:${body}`;
  if (!verifyHMAC(payloadForHMAC, secret, hmacStr)) {
    return {
      valid: false,
      error: 'HMAC inválido',
      code: 'INVALID_HMAC',
    };
  }

  return { valid: true };
}

/**
 * Prepara headers de segurança para envio de webhook
 */
export function prepareWebhookHeaders(
  body: string,
  secret: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();
  const payloadForHMAC = `${timestamp}:${nonce}:${body}`;
  const hmac = generateHMAC(payloadForHMAC, secret);

  return {
    'x-webhook-timestamp': timestamp.toString(),
    'x-webhook-nonce': nonce,
    'x-webhook-hmac': hmac,
    'content-type': 'application/json',
  };
}
