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
    
    // Verifica se houve desconexão explícita
    const hasStoredAccount = typeof window !== 'undefined' && 
      window.localStorage.getItem(STORAGE_KEY) !== null;

    // Se não há conta armazenada, não tenta reconectar
    if (!hasStoredAccount) {
      setState((prev) => ({
        ...prev,
        isInstalled: installed,
        isConnected: false,
        account: null,
      }));
      return;
    }

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

      // Tenta usar signInAndWait diretamente primeiro (método mais direto)
      // Se não funcionar, tenta o fluxo connect() + signInAndWait()
      console.log('[Crossmark] Tentando conectar diretamente com signInAndWait...');
      let signInResponse;
      let account: CrossmarkAccount | null = null;

      try {
        // Primeiro tenta signInAndWait diretamente (método mais simples e direto)
        const signInPromise = sdk.async.signInAndWait?.();
        if (!signInPromise) {
          throw new Error('signInAndWait não está disponível no SDK.');
        }

        signInResponse = await Promise.race([
          signInPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT_SIGNIN')), 60000)
          )
        ]);

        console.log('[Crossmark] Sign in response recebida:', signInResponse);
      } catch (signInError: any) {
        console.warn('[Crossmark] signInAndWait direto falhou, tentando fluxo connect() + signInAndWait():', signInError);
        
        // Se signInAndWait direto falhou, tenta o fluxo completo
        if (signInError?.message === 'TIMEOUT_SIGNIN') {
          // Se deu timeout, tenta o fluxo alternativo
          console.log('[Crossmark] Tentando fluxo alternativo com connect() primeiro...');
          
          try {
            // Primeiro chama connect() para abrir a extensão
            const connectResponse = await Promise.race([
              sdk.async.connect?.(30000),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT_CONNECT')), 30000)
              )
            ]);
            
            console.log('[Crossmark] Connect response:', connectResponse);

            if (!connectResponse) {
              throw new Error('A Crossmark não respondeu ao pedido de conexão.');
            }

            // Aguarda um pouco para a extensão abrir
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Depois tenta signInAndWait novamente
            const signInPromise2 = sdk.async.signInAndWait?.();
            if (!signInPromise2) {
              throw new Error('signInAndWait não está disponível no SDK.');
            }

            signInResponse = await Promise.race([
              signInPromise2,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT_SIGNIN')), 60000)
              )
            ]);

            console.log('[Crossmark] Sign in response (após connect):', signInResponse);
          } catch (connectError: any) {
            console.error('[Crossmark] Erro no fluxo alternativo:', connectError);
            
            if (connectError?.message === 'TIMEOUT_CONNECT') {
              throw new Error('A extensão Crossmark não respondeu. Verifique se a extensão está instalada, ativa e tente novamente.');
            }
            if (connectError?.message === 'TIMEOUT_SIGNIN') {
              throw new Error('Aguardando aprovação do usuário na extensão Crossmark. Por favor, verifique se a extensão está aberta e aprovou a conexão.');
            }
            if (connectError?.message?.toLowerCase().includes('rejected') || 
                connectError?.message?.toLowerCase().includes('canceled') ||
                connectError?.message?.toLowerCase().includes('cancelled')) {
              throw new Error('Conexão cancelada pelo usuário.');
            }
            throw connectError;
          }
        } else {
          // Outro tipo de erro
          if (signInError?.message?.toLowerCase().includes('rejected') || 
              signInError?.message?.toLowerCase().includes('canceled') ||
              signInError?.message?.toLowerCase().includes('cancelled')) {
            throw new Error('Conexão cancelada pelo usuário.');
          }
          throw signInError;
        }
      }
      
      console.log('[Crossmark] Sign in response final:', signInResponse);

      // Tenta obter a conta do response ou do SDK sync
      const responseData = (signInResponse as any)?.response?.data || (signInResponse as any)?.data || signInResponse;

      if (responseData) {
        // Tenta múltiplos caminhos para obter os dados
        const address = responseData.address || responseData.account || responseData.Account;
        const network = responseData.network || responseData.Network;
        const publicKey = responseData.publicKey || responseData.public_key || responseData.PublicKey;

        if (address) {
          account = {
            address,
            network: inferNetwork(network),
            publicKey,
          };
        }
      }

      // Se não conseguiu do response, tenta do SDK sync
      if (!account) {
        console.log('[Crossmark] Tentando obter conta do SDK sync...');
        // Aguarda um pouco mais para garantir que o SDK está sincronizado
        await new Promise(resolve => setTimeout(resolve, 1000));
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
    // Faz logout do Better Auth apenas se houver sessão ativa
    try {
      // Verifica se há cookie de sessão antes de tentar fazer logout
      const hasSessionCookie = typeof document !== 'undefined' && 
        document.cookie.includes('better-auth.session_token');
      
      if (hasSessionCookie) {
        const { signOut } = await import('@/lib/auth-client');
        await signOut();
        console.log('[Crossmark] Logout do Better Auth realizado');
      } else {
        console.log('[Crossmark] Nenhuma sessão ativa para fazer logout');
      }
    } catch (authError: any) {
      // Erro 400 geralmente significa que não há sessão ativa, o que é OK
      const status = authError?.status || authError?.response?.status;
      if (status === 400) {
        console.log('[Crossmark] Nenhuma sessão ativa para fazer logout (esperado)');
      } else {
        console.warn('[Crossmark] Erro ao fazer logout do Better Auth:', authError);
      }
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
        // Verifica se há conta armazenada no localStorage
        const storedAccountStr = typeof window !== 'undefined' ? 
          window.localStorage.getItem(STORAGE_KEY) : null;
        const hasStoredAccount = storedAccountStr !== null;

        // Se está instalado, verifica se já tem conta conectada no SDK
        const sdkAccount = buildAccount();

        // Se há conta no localStorage, tenta restaurar
        if (hasStoredAccount) {
          let accountToUse: CrossmarkAccount | null = null;

          // Prioriza conta do SDK se disponível, senão usa a do localStorage
          if (sdkAccount) {
            accountToUse = sdkAccount;
            // Atualiza o localStorage com a conta do SDK (pode ter mudado)
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sdkAccount));
            }
          } else if (storedAccountStr) {
            // Usa a conta do localStorage se o SDK ainda não estiver pronto
            try {
              accountToUse = JSON.parse(storedAccountStr) as CrossmarkAccount;
            } catch {
              // Se o JSON estiver corrompido, remove
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem(STORAGE_KEY);
              }
            }
          }

          // Atualiza o estado com a conta encontrada
          if (accountToUse) {
            setState((prev) => ({
              ...prev,
              isInstalled: true,
              isConnected: true,
              account: accountToUse,
              error: undefined,
            }));
          } else {
            // Há localStorage mas não conseguiu obter conta válida
            setState((prev) => ({
              ...prev,
              isInstalled: true,
              isConnected: false,
              account: null,
            }));
          }
        } else {
          // Não há conta no localStorage - usuário desconectou ou nunca conectou
          if (sdkAccount) {
            // SDK tem conta mas não há localStorage - não reconecta automaticamente
            setState((prev) => ({
              ...prev,
              isInstalled: true,
              isConnected: false,
              account: null,
            }));
          } else {
            // Não há conta nem no SDK nem no localStorage
            setState((prev) => ({
              ...prev,
              isInstalled: true,
              isConnected: false,
              account: null,
            }));
          }
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
