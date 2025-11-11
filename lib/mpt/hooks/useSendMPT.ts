'use client';

import { useState } from 'react';
import { crossmarkSign } from '@/lib/crossmark/helpers';
import { sendMPT } from '../api';

export function useSendMPT() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    mptIssuanceIdHex: string,
    amount: string,
    destination: string,
    senderAddress: string,
    network: string = 'testnet'
  ) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Prepara transação Payment MPT
      const tx: any = {
        TransactionType: 'Payment',
        Account: senderAddress,
        Destination: destination,
        Amount: {
          mpt_issuance_id: mptIssuanceIdHex,
          value: amount,
        },
      };

      // 2. Tenta autofill via API, senão deixa Crossmark fazer
      let prepared = tx;
      try {
        const autofillResponse = await fetch('/api/xrpl/autofill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tx, network }),
        });
        
        if (autofillResponse.ok) {
          const data = await autofillResponse.json();
          prepared = data.prepared || tx;
        }
      } catch (autofillError) {
        // Fallback: usar tx sem autofill e deixar Crossmark fazer
        console.warn('[useSendMPT] Autofill falhou, usando tx crua:', autofillError);
      }

      // 3. Assina com Crossmark (que também pode fazer autofill)
      const txBlob = await crossmarkSign(prepared);

      // 4. Submete transação assinada
      return await sendMPT({
        mptIssuanceIdHex,
        amount,
        destination,
        txBlob,
        network,
      });
    } catch (err: any) {
      const message = err.message || 'Erro ao enviar MPT';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { run, loading, error };
}
