'use client';

import { useState } from 'react';
import { crossmarkSign } from '@/lib/crossmark/helpers';
import { prepareAuthorizeTx, sendMPT } from '../api';

export function useAuthorizeMPT() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    holderAddress: string,
    issuanceIdHex: string,
    unauthorize: boolean = false,
    network: string = 'testnet'
  ) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Prepara transação no backend
      const response = await prepareAuthorizeTx({
        holderAddress,
        issuanceIdHex,
        unauthorize,
        network,
      });

      const { prepared, txBlob, needsSigning } = response as any;

      // 2. Se já veio assinado do backend (com seed), retorna sucesso
      if (txBlob && !needsSigning) {
        // Backend já assinou e submeteu, retorna sucesso
        return { success: true, message: 'Autorização processada pelo backend' };
      }

      // 3. Assina com Crossmark (preparado vem do backend)
      if (!prepared) {
        throw new Error('Transação não foi preparada corretamente');
      }

      const signedBlob = await crossmarkSign(prepared);

      // 4. Submete transação assinada via endpoint de authorize
      // Criamos endpoint específico para submit de authorize
      const submitResponse = await fetch('/api/mpt/authorize/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txBlob: signedBlob,
          network,
        }),
      });

      if (!submitResponse.ok) {
        const error = await submitResponse.json();
        throw new Error(error.error || 'Erro ao submeter autorização');
      }

      return await submitResponse.json();
    } catch (err: any) {
      const message = err.message || 'Erro ao autorizar MPT';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { run, loading, error };
}
