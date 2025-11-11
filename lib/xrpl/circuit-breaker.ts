/**
 * Circuit Breaker
 * Protege contra falhas em cascata de RPC endpoints
 */

import { getPrismaClient } from '../prisma';
import { structuredLog } from '../logging/structured-logger';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Número de falhas para abrir
  successThreshold: number; // Número de sucessos para fechar (HALF_OPEN → CLOSED)
  timeout: number; // Tempo em ms antes de tentar HALF_OPEN
  resetTimeout: number; // Tempo em ms para resetar contador de falhas
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minuto
  resetTimeout: 300000, // 5 minutos
};

/**
 * Verifica estado do circuit breaker
 */
export async function getCircuitState(
  endpoint: string
): Promise<CircuitState> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return 'CLOSED'; // Sem DB, assume fechado
  }

  try {
    const state = await prisma.circuitBreakerState.findUnique({
      where: { endpoint },
    });

    if (!state) {
      return 'CLOSED';
    }

    // Verifica se precisa transicionar
    if (state.state === 'OPEN' && state.nextAttempt) {
      if (new Date() >= state.nextAttempt) {
        // Transiciona para HALF_OPEN
        await prisma.circuitBreakerState.update({
          where: { endpoint },
          data: {
            state: 'HALF_OPEN',
            nextAttempt: null,
          },
        });

        structuredLog('circuit_breaker_half_open', {
          endpoint,
        });

        return 'HALF_OPEN';
      }
    }

    return state.state as CircuitState;
  } catch (error) {
    structuredLog('circuit_breaker_check_failed', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'CLOSED';
  }
}

/**
 * Registra sucesso no circuit breaker
 */
export async function recordSuccess(endpoint: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  try {
    const state = await prisma.circuitBreakerState.upsert({
      where: { endpoint },
      create: {
        endpoint,
        state: 'CLOSED',
        failureCount: 0,
      },
      update: {
        state: 'CLOSED',
        failureCount: 0,
        lastFailure: null,
        openedAt: null,
        nextAttempt: null,
      },
    });

    // Se estava em HALF_OPEN, verifica se pode fechar
    if (state.state === 'HALF_OPEN') {
      // Em produção, você contaria sucessos consecutivos
      // Por simplicidade, fecha após primeiro sucesso
      await prisma.circuitBreakerState.update({
        where: { endpoint },
        data: {
          state: 'CLOSED',
          failureCount: 0,
        },
      });

      structuredLog('circuit_breaker_closed', {
        endpoint,
      });
    }
  } catch (error) {
    structuredLog('circuit_breaker_success_failed', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Registra falha no circuit breaker
 */
export async function recordFailure(
  endpoint: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG
): Promise<CircuitState> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return 'CLOSED';
  }

  try {
    const state = await prisma.circuitBreakerState.upsert({
      where: { endpoint },
      create: {
        endpoint,
        state: 'CLOSED',
        failureCount: 1,
        lastFailure: new Date(),
      },
      update: {
        failureCount: {
          increment: 1,
        },
        lastFailure: new Date(),
      },
    });

    const newFailureCount = state.failureCount + 1;

    // Se excedeu threshold, abre circuit
    if (newFailureCount >= config.failureThreshold && state.state === 'CLOSED') {
      const nextAttempt = new Date(Date.now() + config.timeout);

      await prisma.circuitBreakerState.update({
        where: { endpoint },
        data: {
          state: 'OPEN',
          openedAt: new Date(),
          nextAttempt,
        },
      });

      structuredLog('circuit_breaker_opened', {
        endpoint,
        failureCount: newFailureCount,
        nextAttempt: nextAttempt.toISOString(),
      });

      return 'OPEN';
    }

    // Se estava em HALF_OPEN e falhou, volta para OPEN
    if (state.state === 'HALF_OPEN') {
      const nextAttempt = new Date(Date.now() + config.timeout);

      await prisma.circuitBreakerState.update({
        where: { endpoint },
        data: {
          state: 'OPEN',
          openedAt: new Date(),
          nextAttempt,
          failureCount: newFailureCount,
        },
      });

      structuredLog('circuit_breaker_reopened', {
        endpoint,
      });

      return 'OPEN';
    }

    return state.state as CircuitState;
  } catch (error) {
    structuredLog('circuit_breaker_failure_failed', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'CLOSED';
  }
}

/**
 * Verifica se pode executar operação
 */
export async function canExecute(endpoint: string): Promise<boolean> {
  const state = await getCircuitState(endpoint);
  return state !== 'OPEN';
}
