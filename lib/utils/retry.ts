/**
 * Utilitários de retry com backoff exponencial
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryable?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryable: () => true,
};

/**
 * Executa uma função com retry e backoff exponencial
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Verifica se o erro é retryable
      if (!opts.retryable(error)) {
        throw error;
      }

      // Se não é a última tentativa, aguarda antes de tentar novamente
      if (attempt < opts.maxAttempts - 1) {
        const delay = Math.min(
          opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelay
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Retry específico para operações XRPL
 */
export function isXRPLRetryableError(error: any): boolean {
  // Erros que podem ser retryable
  const retryableMessages = [
    'timeout',
    'connection',
    'network',
    'ECONNRESET',
    'ETIMEDOUT',
    'disconnected',
  ];

  const message = error?.message?.toLowerCase() || '';
  const errorCode = error?.code?.toLowerCase() || '';
  
  return retryableMessages.some((msg) => 
    message.includes(msg) || errorCode.includes(msg)
  );
}

export async function withXRPLRetry<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'retryable'> = {}
): Promise<T> {
  return withRetry(fn, {
    ...options,
    retryable: isXRPLRetryableError,
  });
}
