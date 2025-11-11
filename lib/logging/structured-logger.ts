/**
 * Structured Logger
 * Logs estruturados com correlação (purchase_id, tx_hash, jobId)
 */

export interface LogContext {
  purchaseId?: string;
  txHash?: string;
  jobId?: string;
  correlationId?: string;
  userId?: string;
  [key: string]: unknown;
}

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Estrutura log para output
 */
function formatLog(
  level: LogLevel,
  event: string,
  context: LogContext,
  message?: string
): string {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    event,
    message,
    ...context,
  };

  return JSON.stringify(logEntry);
}

/**
 * Log estruturado
 */
export function structuredLog(
  event: string,
  context: LogContext,
  level: LogLevel = 'INFO',
  message?: string
): void {
  const logOutput = formatLog(level, event, context, message);

  // Em produção, enviar para serviço de logging (Sentry, Datadog, etc.)
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrar com serviço de logging
    // sendToLoggingService(logOutput);
  }

  // Console para desenvolvimento
  if (process.env.NODE_ENV === 'development' || LOG_LEVELS[level] >= LOG_LEVELS.WARN) {
    console.log(logOutput);
  }
}

/**
 * Log de erro
 */
export function logError(
  event: string,
  error: Error | string,
  context: LogContext = {}
): void {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  structuredLog(
    event,
    {
      ...context,
      error: errorMessage,
      stack: errorStack,
    },
    'ERROR'
  );
}

/**
 * Log de métrica
 */
export function logMetric(
  metricName: string,
  value: number,
  context: LogContext = {}
): void {
  structuredLog(
    'metric',
    {
      ...context,
      metric: metricName,
      value,
    },
    'INFO'
  );
}
