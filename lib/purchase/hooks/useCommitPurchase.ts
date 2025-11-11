'use client';

import { useState } from 'react';
import { crossmarkSignAndSubmit } from '@/lib/crossmark/helpers';

export interface CommitPurchaseParams {
  issuanceIdHex: string;
  quantity: string;
  quotedPrice: string;
  currency: 'XRP' | 'RLUSD';
  buyerAddress: string;
  purchaseId?: string;
  network?: string;
}

export interface PaymentInstructions {
  destination: string;
  amount: string;
  currency: string;
  memo: string;
}

/**
 * Hook para commit de compra primária
 */
export function useCommitPurchase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async (params: CommitPurchaseParams): Promise<{
    purchaseId: string;
    paymentInstructions: PaymentInstructions;
  }> => {
    setLoading(true);
    setError(null);

    try {
      // 1. Registra intenção de compra
      const commitResponse = await fetch('/api/purchase/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          issuanceIdHex: params.issuanceIdHex,
          quantity: params.quantity,
          quotedPrice: params.quotedPrice,
          currency: params.currency,
          buyerAddress: params.buyerAddress,
          purchaseId: params.purchaseId,
          network: params.network || 'testnet',
        }),
      });

      if (!commitResponse.ok) {
        const errorData = await commitResponse.json();
        throw new Error(errorData.error || 'Erro ao registrar compra');
      }

      const commitData = await commitResponse.json();
      const { purchaseId, paymentInstructions } = commitData;

      // 2. Se for XRP, pode enviar pagamento automaticamente via Crossmark
      if (params.currency === 'XRP') {
        try {
          const tx: any = {
            TransactionType: 'Payment',
            Account: params.buyerAddress,
            Destination: paymentInstructions.destination,
            Amount: paymentInstructions.amount, // XRP em drops
            Memos: [
              {
                Memo: {
                  MemoType: Buffer.from('NOTE', 'utf-8').toString('hex').toUpperCase(),
                  MemoData: Buffer.from(paymentInstructions.memo, 'utf-8').toString('hex').toUpperCase(),
                },
              },
            ],
          };

          // Assina e submete via Crossmark
          const result = await crossmarkSignAndSubmit(tx);

          // 3. Confirma pagamento automaticamente
          const confirmResponse = await fetch('/api/purchase/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              purchaseId,
              paymentTxHash: result.txHash,
              network: params.network || 'testnet',
            }),
          });

          if (!confirmResponse.ok) {
            const errorData = await confirmResponse.json();
            // Não falha a compra, apenas loga erro
            console.warn('[Purchase] Erro ao confirmar automaticamente:', errorData);
          }
        } catch (paymentError: any) {
          // Pagamento falhou, mas compra foi registrada
          // Usuário pode tentar confirmar manualmente depois
          console.warn('[Purchase] Erro ao enviar pagamento:', paymentError);
          // Não lança erro, deixa usuário confirmar manualmente
        }
      }

      return { purchaseId, paymentInstructions };
    } catch (err: any) {
      const message = err.message || 'Erro ao registrar compra';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { commit, loading, error };
}
