'use client';

import { useState } from 'react';

export interface QuotePurchaseParams {
  issuanceIdHex: string;
  quantity: string;
  currency: 'XRP' | 'RLUSD';
  network?: string;
}

export interface QuoteResult {
  quoteId: string;
  price: string;
  currency: string;
  expiresAt: string;
  treasuryAddress: string;
}

/**
 * Hook para obter cotação de compra
 */
export function useQuotePurchase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = async (params: QuotePurchaseParams): Promise<QuoteResult> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/purchase/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          issuanceIdHex: params.issuanceIdHex,
          quantity: params.quantity,
          currency: params.currency,
          network: params.network || 'testnet',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao obter cotação');
      }

      return await response.json();
    } catch (err: any) {
      const message = err.message || 'Erro ao obter cotação';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { quote, loading, error };
}
