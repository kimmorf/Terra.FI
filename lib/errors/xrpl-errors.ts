/**
 * Classes de erro customizadas para XRPL e Crossmark
 */

export class XRPLError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'XRPLError';
    Object.setPrototypeOf(this, XRPLError.prototype);
  }
}

export class CrossmarkError extends Error {
  constructor(
    message: string,
    public code: 'NOT_INSTALLED' | 'NOT_CONNECTED' | 'USER_REJECTED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'UNKNOWN',
    public cause?: Error
  ) {
    super(message);
    this.name = 'CrossmarkError';
    Object.setPrototypeOf(this, CrossmarkError.prototype);
  }
}

export class TransactionError extends Error {
  constructor(
    message: string,
    public code: string,
    public txHash?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'TransactionError';
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: string[],
    public cause?: Error
  ) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
