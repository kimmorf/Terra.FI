/**
 * Catálogo de Erros XRPL Comuns
 * Mapeia engine_result codes para ações corretivas
 */

export interface XRPLErrorAction {
  retryable: boolean;
  backoff?: 'exponential' | 'linear' | 'fixed';
  maxRetries?: number;
  action: 'retry' | 'resubmit' | 'skip' | 'fail' | 'manual_review';
  description: string;
  correctiveAction?: string;
}

export interface XRPLErrorEntry {
  code: string;
  name: string;
  category: 'ledger' | 'network' | 'validation' | 'auth' | 'state';
  action: XRPLErrorAction;
}

/**
 * Catálogo completo de erros XRPL com ações corretivas
 */
export const XRPL_ERROR_CATALOG: Record<string, XRPLErrorEntry> = {
  // Success codes
  tesSUCCESS: {
    code: 'tesSUCCESS',
    name: 'Transaction succeeded',
    category: 'ledger',
    action: {
      retryable: false,
      action: 'skip',
      description: 'Transaction was successful',
    },
  },

  // Retryable errors - Network/Timeout
  telLOCAL_ERROR: {
    code: 'telLOCAL_ERROR',
    name: 'Local error',
    category: 'network',
    action: {
      retryable: true,
      backoff: 'exponential',
      maxRetries: 5,
      action: 'retry',
      description: 'Local error occurred, likely network issue',
      correctiveAction: 'Retry with exponential backoff',
    },
  },
  tecPATH_DRY: {
    code: 'tecPATH_DRY',
    name: 'Path dry',
    category: 'ledger',
    action: {
      retryable: true,
      backoff: 'exponential',
      maxRetries: 3,
      action: 'retry',
      description: 'No path found, may succeed later',
      correctiveAction: 'Retry after ledger close',
    },
  },
  tecPATH_PARTIAL: {
    code: 'tecPATH_PARTIAL',
    name: 'Path partial',
    category: 'ledger',
    action: {
      retryable: true,
      backoff: 'exponential',
      maxRetries: 3,
      action: 'retry',
      description: 'Partial path found, may succeed later',
      correctiveAction: 'Retry after ledger close',
    },
  },

  // LastLedgerSequence expired
  tefMAX_LEDGER: {
    code: 'tefMAX_LEDGER',
    name: 'Max ledger exceeded',
    category: 'ledger',
    action: {
      retryable: true,
      backoff: 'fixed',
      maxRetries: 1,
      action: 'resubmit',
      description: 'LastLedgerSequence expired, transaction too old',
      correctiveAction: 'Resubmit with new LastLedgerSequence',
    },
  },

  // Out of sequence
  tefPAST_SEQ: {
    code: 'tefPAST_SEQ',
    name: 'Past sequence',
    category: 'state',
    action: {
      retryable: true,
      backoff: 'fixed',
      maxRetries: 1,
      action: 'resubmit',
      description: 'Sequence number too low',
      correctiveAction: 'Resubmit with correct sequence number',
    },
  },
  terPRE_SEQ: {
    code: 'terPRE_SEQ',
    name: 'Pre-sequence',
    category: 'state',
    action: {
      retryable: true,
      backoff: 'exponential',
      maxRetries: 5,
      action: 'retry',
      description: 'Sequence number too high, wait for previous transactions',
      correctiveAction: 'Wait and retry after previous transactions complete',
    },
  },

  // Insufficient funds
  tecUNFUNDED_PAYMENT: {
    code: 'tecUNFUNDED_PAYMENT',
    name: 'Unfunded payment',
    category: 'validation',
    action: {
      retryable: false,
      action: 'fail',
      description: 'Insufficient funds for payment',
      correctiveAction: 'Check account balance before retry',
    },
  },
  tecINSUF_RESERVE_LINE: {
    code: 'tecINSUF_RESERVE_LINE',
    name: 'Insufficient reserve for trustline',
    category: 'validation',
    action: {
      retryable: false,
      action: 'fail',
      description: 'Insufficient reserve to create trustline',
      correctiveAction: 'Account needs more XRP reserve',
    },
  },

  // Authorization errors
  tefNO_AUTH_REQUIRED: {
    code: 'tefNO_AUTH_REQUIRED',
    name: 'No auth required',
    category: 'auth',
    action: {
      retryable: false,
      action: 'manual_review',
      description: 'Authorization not required but was attempted',
      correctiveAction: 'Review token configuration',
    },
  },
  tecNO_AUTH: {
    code: 'tecNO_AUTH',
    name: 'No authorization',
    category: 'auth',
    action: {
      retryable: true,
      backoff: 'fixed',
      maxRetries: 1,
      action: 'resubmit',
      description: 'Holder not authorized, need to authorize first',
      correctiveAction: 'Authorize holder before retry',
    },
  },

  // Freeze errors
  tecFROZEN: {
    code: 'tecFROZEN',
    name: 'Frozen',
    category: 'state',
    action: {
      retryable: false,
      action: 'fail',
      description: 'Token is frozen',
      correctiveAction: 'Unfreeze token before operation',
    },
  },

  // Trustline errors
  tecNO_LINE: {
    code: 'tecNO_LINE',
    name: 'No trustline',
    category: 'validation',
    action: {
      retryable: true,
      backoff: 'fixed',
      maxRetries: 1,
      action: 'resubmit',
      description: 'Trustline does not exist',
      correctiveAction: 'Create trustline before payment',
    },
  },
  tecNO_LINE_REDUNDANT: {
    code: 'tecNO_LINE_REDUNDANT',
    name: 'Redundant trustline',
    category: 'validation',
    action: {
      retryable: false,
      action: 'skip',
      description: 'Trustline already exists',
      correctiveAction: 'Operation can be skipped',
    },
  },

  // MPT specific errors
  tecMPT_INVALID_CURRENCY: {
    code: 'tecMPT_INVALID_CURRENCY',
    name: 'Invalid MPT currency',
    category: 'validation',
    action: {
      retryable: false,
      action: 'fail',
      description: 'Invalid MPT currency format',
      correctiveAction: 'Check currency format (3-160 chars, uppercase)',
    },
  },
};

/**
 * Obtém ação corretiva para um erro XRPL
 */
export function getErrorAction(engineResult: string): XRPLErrorEntry | null {
  return XRPL_ERROR_CATALOG[engineResult] || null;
}

/**
 * Verifica se um erro é retryable
 */
export function isRetryableError(engineResult: string): boolean {
  const entry = getErrorAction(engineResult);
  return entry?.action.retryable ?? false;
}

/**
 * Obtém estratégia de backoff para um erro
 */
export function getBackoffStrategy(engineResult: string): XRPLErrorAction['backoff'] {
  const entry = getErrorAction(engineResult);
  return entry?.action.backoff ?? 'exponential';
}

/**
 * Obtém número máximo de retries para um erro
 */
export function getMaxRetries(engineResult: string): number {
  const entry = getErrorAction(engineResult);
  return entry?.action.maxRetries ?? 3;
}
