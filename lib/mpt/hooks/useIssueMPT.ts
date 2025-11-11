'use client';

import { useState } from 'react';
import { issueMPT } from '../api';

export function useIssueMPT() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (params: {
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
  }) => {
    setLoading(true);
    setError(null);

    try {
      return await issueMPT(params);
    } catch (err: any) {
      const message = err.message || 'Erro ao emitir MPT';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { run, loading, error };
}
