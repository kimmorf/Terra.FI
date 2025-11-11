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

function inferNetwork(
  network?:
    | CrossmarkNetwork
    | { network?: string | null }
    | { type?: string | null }
    | { label?: string | null }
    | string
    | null,
): CrossmarkNetwork {
  if (!network) return 'testnet';

  const extract = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return undefined;

    const candidate =
      'network' in value && typeof value.network === 'string'
        ? value.network
        : 'type' in value && typeof value.type === 'string'
          ? value.type
          : 'label' in value && typeof value.label === 'string'
            ? value.label
            : undefined;

    return candidate ?? undefined;
  };

  const raw = extract(network);
  if (!raw) return 'testnet';

  const normalized = raw.toLowerCase();

  if (normalized.includes('main') || normalized.includes('live')) return 'mainnet';
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
      console.log('[Crossmark] Iniciando conexão...');

      // Primeiro, tenta detectar a extensão
      console.log('[Crossmark] Detectando extensão...');
      const detected = await sdk.async.detect?.(10000);
      console.log('[Crossmark] Detectado:', detected);

      if (!detected) {
        throw new Error('Não foi possível detectar a extensão Crossmark. Certifique-se de que a extensão está instalada e ativa.');
      }

      // Primeiro chama connect() para abrir a extensão e aguardar
      console.log('[Crossmark] Chamando connect() para abrir a extensão...');
      const connectResponse = await sdk.async.connect?.(10000);
      console.log('[Crossmark] Connect response:', connectResponse);

      if (!connectResponse) {
        throw new Error('A Crossmark não respondeu ao pedido de conexão.');
      }

      // Depois chama signInAndWait para aguardar a aprovação do usuário
      console.log('[Crossmark] Aguardando sign in do usuário...');
      const signInResponse = await sdk.async.signInAndWait?.();
      console.log('[Crossmark] Sign in response:', signInResponse);

      // Tenta obter a conta do response ou do SDK sync
      let account: CrossmarkAccount | null = null;

      const responseData = signInResponse?.response?.data;

      if (responseData) {
        account = {
          address: responseData.address,
          network: inferNetwork(responseData.network),
          publicKey: responseData.publicKey,
        };
      } else {
        // Tenta obter do SDK sync
        account = buildAccount();
      }

      if (!account) {
        throw new Error('A Crossmark não retornou informações da conta. Tente conectar novamente.');
      }

      console.log('[Crossmark] Conta obtida:', account);

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

      // Faz login no Better Auth com o endereço da carteira
      try {
        const { signInWithWallet } = await import('@/lib/auth-client');
        await signInWithWallet(account.address, account.network, account.publicKey);
        console.log('[Crossmark] Login no Better Auth realizado com sucesso');
      } catch (authError) {
        console.warn('[Crossmark] Erro ao fazer login no Better Auth:', authError);
        // Não falha a conexão se o login no Better Auth falhar
      }

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

  const disconnect = useCallback(async () => {
    // Faz logout do Better Auth
    try {
      const { signOut } = await import('@/lib/auth-client');
      await signOut();
      console.log('[Crossmark] Logout do Better Auth realizado');
    } catch (authError) {
      console.warn('[Crossmark] Erro ao fazer logout do Better Auth:', authError);
      // Continua mesmo se houver erro ao fazer logout
    }

    // Limpa o localStorage
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    // Atualiza o estado
    setState((prev) => ({
      ...prev,
      isConnected: false,
      account: null,
      error: undefined,
    }));
  }, []);

  useEffect(() => {
    let mounted = true;
    let checkInterval: NodeJS.Timeout | null = null;

    const checkInstallation = () => {
      if (!mounted) return;

      const installed = resolveInstallation();

      if (installed) {
        // Se está instalado, verifica se já tem conta conectada (apenas se o usuário já conectou antes)
        const sdkAccount = buildAccount();

        if (sdkAccount) {
          // Já tem conta conectada no SDK - atualiza o estado e localStorage
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sdkAccount));
          }
          setState((prev) => ({
            ...prev,
            isInstalled: true,
            isConnected: true,
            account: sdkAccount,
            error: undefined,
          }));
        } else {
          // Está instalado mas não conectado - apenas atualiza o estado de instalação
          // Não conecta automaticamente, espera o usuário clicar
          setState((prev) => ({
            ...prev,
            isInstalled: true,
            isConnected: false,
            account: null,
          }));
        }
      } else {
        // Não está instalado, apenas atualiza o estado
        setState((prev) => ({
          ...prev,
          isInstalled: false,
          isConnected: false,
          account: null,
        }));
      }
    };

    // Verifica imediatamente
    checkInstallation();

    // Verifica periodicamente (a cada 2 segundos) para detectar quando o usuário instala
    checkInterval = setInterval(checkInstallation, 2000);

    // Configura listeners do SDK se disponível
    const sdk = getCrossmarkSDK();
    if (sdk?.on) {
      const handleUserChange = () => refreshAccount();
      const handleNetworkChange = () => refreshAccount();
      const handleSignOut = () => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(STORAGE_KEY);
        }
        setState((prev) => ({
          ...prev,
          isConnected: false,
          account: null,
        }));
      };

      sdk.on('user-change', handleUserChange);
      sdk.on('network-change', handleNetworkChange);
      sdk.on('signout', handleSignOut);

      return () => {
        mounted = false;
        if (checkInterval) {
          clearInterval(checkInterval);
        }
        sdk.off?.('user-change', handleUserChange);
        sdk.off?.('network-change', handleNetworkChange);
        sdk.off?.('signout', handleSignOut);
      };
    }

    return () => {
      mounted = false;
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [resolveInstallation, refreshAccount]);

  return {
    ...state,
    connect,
    disconnect,
    refreshAccount,
  };
}
