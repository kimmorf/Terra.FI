'use client';

import { useState, useEffect } from 'react';

export type PurchaseStatus =
  | 'PENDING_PAYMENT'
  | 'FUNDS_CONFIRMED'
  | 'MPT_SENT'
  | 'COMPLETED'
  | 'COMPENSATION_REQUIRED'
  | 'REFUNDED';

export interface PurchaseData {
  purchase: {
    id: string;
    purchaseId: string;
    issuanceIdHex: string;
    buyerAddress: string;
    quantity: string;
    quotedPrice: string;
    currency: string;
    treasuryAddress: string;
    memo: string | null;
    status: PurchaseStatus;
    paymentTxHash: string | null;
    mptTxHash: string | null;
    compensationReason: string | null;
    refundTxHash: string | null;
    network: string;
    createdAt: string;
    updatedAt: string;
  };
  events: Array<{
    id: string;
    eventType: string;
    fromState: string | null;
    toState: string;
    metadata: any;
    triggeredBy: string | null;
    createdAt: string;
  }>;
  ledgerTxs: Array<{
    id: string;
    leg: number;
    txHash: string;
    status: string;
    engineResult: string | null;
    ledgerIndex: number | null;
    submittedAt: string;
    validatedAt: string | null;
    error: string | null;
  }>;
}

/**
 * Hook para buscar estado de uma compra
 */
export function usePurchase(purchaseId: string | null, network: string = 'testnet') {
  const [data, setData] = useState<PurchaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPurchase = async () => {
    if (!purchaseId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/purchase/${purchaseId}?network=${network}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao buscar compra');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!purchaseId) return;

    fetchPurchase();

    // Polling a cada 3 segundos se ainda não completou
    const status = data?.purchase.status;
    if (status && status !== 'COMPLETED' && status !== 'REFUNDED') {
      const interval = setInterval(fetchPurchase, 3000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId, network]);

  return { data, loading, error, refetch: fetchPurchase };
}

/**
 * Hook para obter progresso da compra (0-100)
 */
export function usePurchaseProgress(data: PurchaseData | null): number {
  if (!data) return 0;

  const status = data.purchase.status;

  switch (status) {
    case 'PENDING_PAYMENT':
      return 10;
    case 'FUNDS_CONFIRMED':
      return 50;
    case 'MPT_SENT':
      return 90;
    case 'COMPLETED':
      return 100;
    case 'COMPENSATION_REQUIRED':
      return 50; // Parado aguardando compensação
    case 'REFUNDED':
      return 0;
    default:
      return 0;
  }
}
