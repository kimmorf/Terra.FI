/**
 * API client para operações MPT
 */

export interface PrepareAuthorizeTxResponse {
  prepared: any;
  txBlob: string | null;
}

/**
 * Prepara transação de autorização MPT
 */
export async function prepareAuthorizeTx(params: {
  holderAddress: string;
  issuanceIdHex: string;
  unauthorize?: boolean;
  network?: string;
}): Promise<PrepareAuthorizeTxResponse> {
  const response = await fetch('/api/mpt/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      holderAddress: params.holderAddress,
      issuanceIdHex: params.issuanceIdHex,
      unauthorize: params.unauthorize,
      network: params.network || 'testnet',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao preparar transação de autorização');
  }

  return response.json();
}

/**
 * Emite novo MPT
 */
export async function issueMPT(params: {
  assetScale?: number;
  maximumAmount?: string;
  transferFee?: number;
  metadataJSON?: Record<string, any>;
  flags?: {
    canLock?: boolean;
    requireAuth?: boolean;
    canEscrow?: boolean;
    canTrade?: boolean;
    canTransfer?: boolean;
    canClawback?: boolean;
  };
  network?: string;
}): Promise<{
  txHash: string;
  meta?: any;
  issuanceIdHex?: string;
}> {
  const response = await fetch('/api/mpt/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetScale: params.assetScale ?? 0,
      maximumAmount: params.maximumAmount ?? '0',
      transferFee: params.transferFee ?? 0,
      metadataJSON: params.metadataJSON,
      flags: params.flags ?? {},
      network: params.network || 'testnet',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao emitir MPT');
  }

  return response.json();
}

/**
 * Envia MPT (com txBlob assinado)
 */
export async function sendMPT(params: {
  mptIssuanceIdHex: string;
  amount: string;
  destination: string;
  txBlob: string;
  network?: string;
}): Promise<{
  txHash: string;
  meta?: any;
}> {
  const response = await fetch('/api/mpt/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mptIssuanceIdHex: params.mptIssuanceIdHex,
      amount: params.amount,
      destination: params.destination,
      txBlob: params.txBlob,
      network: params.network || 'testnet',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao enviar MPT');
  }

  return response.json();
}

/**
 * Lista MPTs emitidos por uma conta
 */
export async function listMPTs(params: {
  issuer: string;
  network?: string;
}): Promise<{
  issuer: string;
  network: string;
  count: number;
  tokens: Array<{
    issuanceIdHex: string;
    txHash: string;
    ledgerIndex: number;
    assetScale: number;
    maximumAmount: string;
    transferFee: number;
    flags: {
      canLock: boolean;
      requireAuth: boolean;
      canEscrow: boolean;
      canTrade: boolean;
      canTransfer: boolean;
      canClawback: boolean;
    };
    metadata: any;
    issuedAt?: string;
  }>;
}> {
  const response = await fetch(
    `/api/mpt/list?issuer=${encodeURIComponent(params.issuer)}&network=${params.network || 'testnet'}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao listar MPTs emitidos');
  }

  return response.json();
}
