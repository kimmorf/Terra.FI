'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCrossmarkSDK } from './sdk';
import type { CrossmarkAccount, CrossmarkState, CrossmarkNetwork } from './types';

const STORAGE_KEY = 'terrafi:crossmark-account';

const INITIAL_STATE: CrossmarkState = {
  isInstalled: false,
  isConnected: false,
  isLoading: false,
  account: null,
  error: undefined,
};

function inferNetwork(network?: { network?: string }): CrossmarkNetwork {
  if (!network?.network) return 'testnet';

  const normalized = network.network.toLowerCase();

  if (normalized.includes('main')) return 'mainnet';
  if (normalized.includes('dev')) return 'devnet';

  return 'testnet';
}

function buildAccount(): CrossmarkAccount | null {
  const sdk = getCrossmarkSDK();
  if (!sdk) return null;

  try {
    const address = sdk.sync.getAddress?.();
    if (!address) return null;

    const network = inferNetwork(sdk.sync.getNetwork?.());
    const user = sdk.sync.getUser?.();

    return {
      address,
      network,
      publicKey: user?.publicKey,
    };
  } catch (error) {
    console.error('[Crossmark] Erro ao montar conta', error);
    return null;
  }
}

export function useCrossmark() {
  const [state, setState] = useState<CrossmarkState>(INITIAL_STATE);

  const resolveInstallation = useCallback(() => {
    const sdk = getCrossmarkSDK();
    if (!sdk) return false;

    try {
      return Boolean(sdk.sync.isInstalled?.());
    } catch (error) {
      console.warn('[Crossmark] Falha ao verificar instalação', error);
      return false;
    }
  }, []);

  const refreshAccount = useCallback(() => {
    const installed = resolveInstallation();
    const sdkAccount = installed ? buildAccount() : null;

    let account = sdkAccount;

    if (!account && typeof window !== 'undefined') {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (cached) {
        try {
          account = JSON.parse(cached) as CrossmarkAccount;
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }

    setState((prev) => ({
      ...prev,
      isInstalled: installed,
      isConnected: Boolean(account),
      account: account ?? null,
    }));
  }, [resolveInstallation]);

  const connect = useCallback(async () => {
    const sdk = getCrossmarkSDK();
    if (!sdk) {
      setState((prev) => ({
        ...prev,
        error: 'Crossmark SDK indisponível no ambiente atual.',
      }));
      return false;
    }

    const installed = resolveInstallation();
    if (!installed) {
      setState((prev) => ({
        ...prev,
        isInstalled: false,
        error: 'Crossmark não está instalada. Instale a extensão e tente novamente.',
      }));
      return false;
    }

    setState((prev) => ({
      ...prev,
      isInstalled: true,
      isLoading: true,
      error: undefined,
    }));

    try {
      const detected = await sdk.async.detect?.(5000);
      if (detected === false) {
        throw new Error('Não foi possível detectar a extensão Crossmark.');
      }

      await sdk.async.connect?.(5000);
      const response = await sdk.async.signInAndWait?.();

      const account: CrossmarkAccount | null = response?.data?.user
        ? {
            address: response.data.user.address,
            network: inferNetwork({ network: response.data.user.network }),
            publicKey: response.data.user.publicKey,
          }
        : buildAccount();

      if (!account) {
        throw new Error('A Crossmark não retornou informações da conta.');
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
      }

      setState({
        isInstalled: true,
        isConnected: true,
        isLoading: false,
        account,
        error: undefined,
      });

      return true;
    } catch (error) {
      console.error('[Crossmark] Erro ao conectar', error);
      const message =
        error instanceof Error ? error.message : 'Erro ao conectar com a Crossmark.';

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      setState({
        isInstalled: true,
        isConnected: false,
        isLoading: false,
        account: null,
        error: message,
      });

      return false;
    }
  }, [resolveInstallation]);

  const disconnect = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
      account: null,
      error: undefined,
    }));
  }, []);

  useEffect(() => {
    let mounted = true;

    if (mounted) {
      refreshAccount();
    }

    return () => {
      mounted = false;
    };
  }, [refreshAccount]);

  return {
    ...state,
    connect,
    disconnect,
    refreshAccount,
  };
}
