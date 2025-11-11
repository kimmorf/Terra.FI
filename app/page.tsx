'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Shield,
  Download,
  MousePointerClick,
  CheckCircle2,
  Sparkles,
  Building2,
  TrendingUp,
  Coins,
  Zap,
  Mountain,
  Hammer,
  DollarSign,
  Lock,
  ArrowRight,
  Plus,
  X,
  LogOut,
  Copy,
  Check,
  AlertCircle,
  Info,
  FileText,
  Upload,
  KeyRound,
} from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { InvestmentCard } from '@/components/InvestmentCard';
import { useSession } from '@/lib/auth-client';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';
import {
  buildMPTokenIssuanceTransaction,
  signAndSubmitTransaction,
  extractTransactionHash,
} from '@/lib/crossmark/transactions';
import type { MPTokenMetadata } from '@/lib/crossmark/types';
import { registerIssuance } from '@/lib/elysia-client';
import { getAccountMPTokens, getXRPBalance } from '@/lib/xrpl/account';
import { TOKEN_CONFIG } from '@/lib/tokens/presets';

interface AdminProject {
  id: string;
  name: string;
  type: string;
  description?: string;
  purpose: string;
  example?: string;
  minAmount: number;
  maxAmount?: number;
  totalAmount: number;
  targetAmount: number;
  status: string;
}

interface InvestorServiceWallet {
  id: string;
  label: string;
  address: string;
  network: 'testnet' | 'devnet' | 'mainnet';
  type: string;
}

const typeIcons = {
  LAND: Mountain,
  BUILD: Hammer,
  REV: DollarSign,
  COL: Lock,
};

const typeColors = {
  LAND: 'from-green-400 to-green-600 dark:from-green-500 dark:to-green-700',
  BUILD: 'from-orange-400 to-orange-600 dark:from-orange-500 dark:to-orange-700',
  REV: 'from-yellow-400 to-yellow-600 dark:from-yellow-500 dark:to-yellow-700',
  COL: 'from-purple-400 to-purple-600 dark:from-purple-500 dark:to-purple-700',
};

export default function Home() {
  const { data: session, isPending: isSessionPending } = useSession();
  const {
    isInstalled,
    isConnected,
    isLoading: isWalletLoading,
    account,
    error: crossmarkError,
    connect,
    disconnect,
    refreshAccount,
  } = useCrossmarkContext();

  const [selectedRole, setSelectedRole] =
    useState<'investidor' | 'administrador'>('investidor');
  const [investorTab, setInvestorTab] = useState<'investments' | 'my-tokens' | 'available-tokens'>('available-tokens');
  const [adminProjects, setAdminProjects] = useState<AdminProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'LAND',
    description: '',
    purpose: '',
    example: '',
    minAmount: '',
    maxAmount: '',
    targetAmount: '',
  });
  const [mptokens, setMptokens] = useState<any[]>([]);
  const [noTokensDismissed, setNoTokensDismissed] = useState(false);
  const [xrpBalance, setXrpBalance] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [hasLoadedTokens, setHasLoadedTokens] = useState(false);
  const [availableTokens, setAvailableTokens] = useState<any[]>([]);
  const [loadingAvailableTokens, setLoadingAvailableTokens] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issuingProjectId, setIssuingProjectId] = useState<string | null>(null);
  const [issuanceSuccess, setIssuanceSuccess] = useState<string | null>(null);
  const [issuanceError, setIssuanceError] = useState<string | null>(null);
  const [investmentProjects, setInvestmentProjects] = useState<any[]>([]);
  const [loadingInvestments, setLoadingInvestments] = useState(false);
  const [adminInvestments, setAdminInvestments] = useState<any[]>([]);
  const [loadingAdminInvestments, setLoadingAdminInvestments] = useState(false);
  const [adminTab, setAdminTab] = useState<'projects' | 'investments'>('projects');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedProjectForUpload, setSelectedProjectForUpload] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [serviceWallet, setServiceWallet] = useState<InvestorServiceWallet | null>(null);
  const [loadingServiceWallet, setLoadingServiceWallet] = useState(true);

  const refreshServiceWallet = useCallback(async () => {
    setLoadingServiceWallet(true);
    try {
      const response = await fetch('/api/investor/wallet');
      if (!response.ok) {
        setServiceWallet(null);
        return;
      }
      const data = await response.json();
      setServiceWallet(data.wallet ?? null);
    } catch (error) {
      console.error('[App] Falha ao carregar carteira de serviço:', error);
      setServiceWallet(null);
    } finally {
      setLoadingServiceWallet(false);
    }
  }, []);

  useEffect(() => {
    refreshServiceWallet();
  }, [refreshServiceWallet]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => refreshServiceWallet();
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [refreshServiceWallet]);

  const effectiveAddress = serviceWallet?.address ?? account?.address ?? null;
  const effectiveNetwork = serviceWallet?.network ?? (account?.network as 'testnet' | 'devnet' | 'mainnet' | undefined) ?? 'testnet';
  const effectiveWalletId = serviceWallet?.id ?? null;
  const isWalletConnected = Boolean(effectiveAddress);

  const loadAccountData = useCallback(async () => {
    if (!effectiveAddress) {
      return;
    }

    if (loadingTokens || hasLoadedTokens) {
      return;
    }

    setLoadingTokens(true);
    setTokensError(null);

    try {
      const [tokens, balance] = await Promise.all([
        getAccountMPTokens(effectiveAddress, effectiveNetwork),
        getXRPBalance(effectiveAddress, effectiveNetwork),
      ]);

      setMptokens(tokens);
      setXrpBalance(balance);
      setHasLoadedTokens(true);
    } catch (error) {
      console.error('Erro ao carregar dados da conta XRPL:', error);
      setTokensError('Não foi possível carregar os dados da conta na XRPL.');
      setMptokens([]);
      setXrpBalance(null);
      setHasLoadedTokens(true);
    } finally {
      setLoadingTokens(false);
    }
  }, [effectiveAddress, effectiveNetwork, loadingTokens, hasLoadedTokens]);

  useEffect(() => {
    setHasLoadedTokens(false);
  }, [effectiveAddress, effectiveNetwork]);

  const handleConnect = useCallback(async () => {
    console.log('[App] handleConnect chamado');
    try {
      console.log('[App] Chamando connect()...');
      const success = await connect();
      console.log('[App] Connect retornou:', success);
      if (success) {
        refreshAccount();
      }
    } catch (error) {
      console.error('[App] Erro no handleConnect:', error);
    }
  }, [connect, refreshAccount]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setMptokens([]);
    setXrpBalance(null);
    setTokensError(null);
    setCopied(false);
    setNoTokensDismissed(false);
    setHasLoadedTokens(false); // Reset flag ao desconectar
  }, [disconnect]);

  const copyAddress = useCallback(() => {
    const addressToCopy = effectiveAddress;
    if (!addressToCopy || typeof navigator === 'undefined') {
      return;
    }

    navigator.clipboard
      .writeText(addressToCopy)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((error) => {
        console.error('Erro ao copiar endereço:', error);
      });
  }, [effectiveAddress]);

  const formatAddress = useCallback((address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }, []);

  const fetchAdminProjects = useCallback(async () => {
    try {
      setLoadingProjects(true);
      const response = await fetch('/api/admin/projects');
      if (response.ok) {
        const data = await response.json();
        setAdminProjects(data);
      } else {
        console.error('Erro ao carregar projetos:', await response.text());
      }
    } catch (error) {
      console.error('Erro ao buscar projetos do admin:', error);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const fetchAdminInvestments = useCallback(async () => {
    try {
      setLoadingAdminInvestments(true);
      const response = await fetch('/api/admin/investments');
      if (response.ok) {
        const data = await response.json();
        setAdminInvestments(data);
      } else {
        console.error('Erro ao carregar investimentos:', await response.text());
      }
    } catch (error) {
      console.error('Erro ao buscar investimentos do admin:', error);
    } finally {
      setLoadingAdminInvestments(false);
    }
  }, []);

  const handleUpdateInvestmentStatus = useCallback(async (investmentId: string, status: string) => {
    if (!isConnected || !account) {
      alert('Você precisa conectar sua carteira para enviar tokens');
      return;
    }

    try {
      const response = await fetch('/api/admin/investments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ investmentId, status }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar investimento');
      }

      const data = await response.json();

      // Se foi publicado e tem informações de distribuição de tokens, envia os tokens
      if (status === 'published' && data.tokenDistribution && data.tokenDistribution.tokenAmount) {
        try {
          const { sendMPToken } = await import('@/lib/crossmark/transactions');
          const { TOKEN_CONFIG } = await import('@/lib/tokens/presets');

          const config = TOKEN_CONFIG[data.tokenDistribution.currency] || { decimals: 2 };
          const tokenAmountInBaseUnits = (parseFloat(data.tokenDistribution.tokenAmount) * Math.pow(10, config.decimals)).toString();

          // Busca o investimento para obter o endereço do investidor
          const investmentResponse = await fetch(`/api/admin/investments`);
          const investments = await investmentResponse.json();
          const investment = investments.find((inv: any) => inv.id === investmentId);

          if (investment?.user?.walletAddress) {
            const tokenResponse = await sendMPToken({
              sender: account.address,
              destination: investment.user.walletAddress,
              amount: tokenAmountInBaseUnits,
              currency: data.tokenDistribution.currency,
              issuer: account.address,
              memo: `Investimento: ${investment.project?.name || 'Projeto'} - ${data.tokenDistribution.tokenAmount} tokens`,
            });

            const txHash = 
              (tokenResponse as any)?.hash ??
              (tokenResponse as any)?.result?.hash ??
              (tokenResponse as any)?.result?.tx_json?.hash ??
              (tokenResponse as any)?.tx_json?.hash ??
              null;

            if (txHash) {
              alert(`Investimento publicado e ${data.tokenDistribution.tokenAmount} tokens enviados com sucesso! Hash: ${txHash.slice(0, 8)}...`);
            } else {
              alert(`Investimento publicado! Enviando ${data.tokenDistribution.tokenAmount} tokens...`);
            }
          } else {
            alert('Investimento publicado, mas não foi possível enviar tokens (endereço do investidor não encontrado)');
          }
        } catch (tokenError: any) {
          console.error('Erro ao enviar tokens:', tokenError);
          alert(`Investimento publicado, mas erro ao enviar tokens: ${tokenError.message}`);
        }
      } else {
        alert(`Investimento ${status === 'published' ? 'publicado' : 'negado'} com sucesso!`);
      }

      // Atualiza a lista de investimentos
      await fetchAdminInvestments();
      // Atualiza também os projetos para refletir o novo total arrecadado
      await fetchAdminProjects();
    } catch (error: any) {
      alert(error.message || 'Erro ao atualizar investimento');
    }
  }, [isConnected, account, fetchAdminInvestments, fetchAdminProjects]);

  useEffect(() => {
    if (selectedRole === 'administrador') {
      fetchAdminProjects();
      if (adminTab === 'investments') {
        fetchAdminInvestments();
      }
    }
  }, [selectedRole, adminTab, fetchAdminProjects, fetchAdminInvestments]);

  const fetchInvestmentProjects = useCallback(async () => {
    if (!session) {
      setInvestmentProjects([]);
      setLoadingInvestments(false);
      return;
    }
    try {
      setLoadingInvestments(true);
      const response = await fetch('/api/investments', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setInvestmentProjects(Array.isArray(data) ? data : []);
      } else {
        setInvestmentProjects([]);
      }
    } catch (error) {
      console.error('Erro ao buscar projetos de investimento:', error);
      setInvestmentProjects([]);
    } finally {
      setLoadingInvestments(false);
    }
  }, [session]);

  useEffect(() => {
    if (!isSessionPending && session && investorTab === 'investments') {
      fetchInvestmentProjects();
    } else if (!isSessionPending && !session && investorTab === 'investments') {
      setInvestmentProjects([]);
      setLoadingInvestments(false);
    }
  }, [isSessionPending, session, investorTab, fetchInvestmentProjects]);

  // Ajusta a aba padrão baseado na disponibilidade
  useEffect(() => {
    if (!session && investorTab === 'investments') {
      setInvestorTab('available-tokens');
    } else if (session && !isConnected && investorTab === 'my-tokens') {
      setInvestorTab('available-tokens');
    }
  }, [session, isConnected, investorTab]);

  // Carrega investimentos disponíveis quando estiver na aba
  useEffect(() => {
    if (investorTab === 'available-tokens') {
      const loadAvailableTokens = async () => {
        setLoadingAvailableTokens(true);
        try {
          const response = await fetch('/api/investments', {
            credentials: 'include',
          });
          if (response.ok) {
            const projects = await response.json();
            // Converte projetos para o formato esperado
            const tokens = projects.map((project: any) => ({
              id: project.id,
              currency: project.type,
              issuer: project.name,
              name: project.name,
              purpose: project.purpose,
              example: project.example,
              minAmount: project.minAmount,
              maxAmount: project.maxAmount,
              targetAmount: project.targetAmount,
              totalAmount: project.totalAmount,
            }));
            setAvailableTokens(tokens);
          }
        } catch (error) {
          console.error('Erro ao carregar investimentos disponíveis:', error);
        } finally {
          setLoadingAvailableTokens(false);
        }
      };
      loadAvailableTokens();
    }
  }, [investorTab]);

  // Verifica se investimento está mockado (valores hardcoded)
  const isInvestmentMocked = useCallback(() => {
    // Wallet de destino hardcoded (mock)
    const MOCK_DESTINATION_WALLET = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
    // Taxa de conversão hardcoded (mock)
    const MOCK_XRP_TO_BRL = 2.5;
    
    // Verifica se está usando valores mockados
    const isMockWallet = true; // Sempre mockado até adicionar campo no projeto
    const isMockRate = true; // Sempre mockado até integrar com oráculo de preço
    
    return isMockWallet || isMockRate;
  }, []);

  const handleInvest = useCallback(async (projectId: string, amount: number) => {
    if (!isConnected || !account) {
      alert('Você precisa conectar sua carteira para investir');
      return;
    }

    // Verifica se está mockado (mantido para referência, mas não bloqueia mais)
    // if (isInvestmentMocked()) {
    //   alert('Investimento temporariamente desabilitado. Sistema em configuração.');
    //   return;
    // }

    // Busca informações do projeto para obter wallet de destino
    const project = availableTokens.find(p => p.id === projectId) || 
                   investmentProjects.find(p => p.id === projectId);
    
    if (!project) {
      alert('Projeto não encontrado');
      return;
    }

    // Taxa de conversão R$ para XRP (pode ser configurável depois)
    // Exemplo: 1 XRP = R$ 2,50 (ajuste conforme necessário)
    const XRP_TO_BRL = 2.5;
    const xrpAmount = amount / XRP_TO_BRL;

    // Verifica saldo XRP
    if (xrpBalance !== null && xrpBalance < xrpAmount) {
      alert(`Saldo insuficiente. Você tem ${xrpBalance.toFixed(2)} XRP, mas precisa de ${xrpAmount.toFixed(2)} XRP.`);
      return;
    }

    // Wallet de destino (pode ser do projeto ou uma wallet central)
    // Por enquanto, usando uma wallet de teste - deve ser configurada no projeto
    // TODO: Adicionar campo walletAddress no InvestmentProject
    const destinationWallet = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'; // Wallet de destino padrão

    try {
      // 1. Envia XRP primeiro
      const { sendXRPPayment } = await import('@/lib/crossmark/transactions');
      
      const paymentResponse = await sendXRPPayment({
        sender: account.address,
        destination: destinationWallet,
        amount: xrpAmount.toString(), // Em XRP
        memo: `Investimento: ${project.name} - R$ ${amount.toFixed(2)}`,
      });

      // Usa função utilitária para extrair hash
      const { extractTransactionHash } = await import('@/lib/crossmark/transactions');
      
      // Log da resposta para debug
      console.log('[Investimento] Resposta do pagamento:', paymentResponse);
      
      // Tenta extrair hash
      let txHash = extractTransactionHash(paymentResponse);
      
      // Se não encontrou, tenta explorar a estrutura manualmente
      if (!txHash) {
        const responseObj = paymentResponse as any;
        
        // Explora estrutura response.response.data...
        if (responseObj?.response) {
          const innerResponse = responseObj.response;
          
          // Tenta múltiplos caminhos
          txHash = 
            innerResponse?.data?.hash ??
            innerResponse?.data?.result?.hash ??
            innerResponse?.data?.result?.tx_json?.hash ??
            innerResponse?.hash ??
            innerResponse?.result?.hash ??
            null;
          
          // Se ainda não encontrou, tenta usar função recursiva avançada
          if (!txHash) {
            try {
              const { extractHashRecursive } = await import('@/lib/crossmark/hash-extractor');
              txHash = extractHashRecursive(innerResponse);
              if (txHash) {
                console.log('[Investimento] Hash encontrado via busca recursiva:', txHash);
              }
            } catch (error) {
              console.warn('[Investimento] Erro ao usar busca recursiva:', error);
            }
          }
        }
      }

      if (!txHash) {
        // Log detalhado para debug
        const responseObj = paymentResponse as any;
        console.error('[Investimento] Não foi possível extrair hash. Resposta completa:', {
          response: paymentResponse,
          type: typeof paymentResponse,
          keys: paymentResponse && typeof paymentResponse === 'object' ? Object.keys(paymentResponse) : null,
          responseStructure: responseObj?.response ? {
            keys: Object.keys(responseObj.response),
            data: responseObj.response.data,
            result: responseObj.response.result,
          } : null,
        });
        
        // Tenta extrair informações úteis para o usuário
        const errorMessage = 
          responseObj?.response?.data?.result?.engine_result_message ??
          responseObj?.response?.data?.message ??
          responseObj?.response?.message ??
          responseObj?.data?.result?.engine_result_message ??
          responseObj?.data?.message ??
          responseObj?.message ??
          'Não foi possível obter o hash da transação. Verifique o console para mais detalhes.';
        
        throw new Error(errorMessage);
      }
      
      console.log('[Investimento] Hash extraído com sucesso:', txHash);

      // 2. Após pagamento confirmado, registra no banco
      const response = await fetch('/api/investments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          projectId, 
          amount,
          walletAddress: account.address,
          txHash, // Hash da transação XRP
          xrpAmount, // Valor em XRP enviado
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao registrar investimento');
      }

      // Atualiza saldo XRP
      if (xrpBalance !== null) {
        setXrpBalance(xrpBalance - xrpAmount);
      }

      await fetchInvestmentProjects();
      alert(`Investimento de ${xrpAmount.toFixed(2)} XRP realizado com sucesso! Hash: ${txHash.slice(0, 8)}...`);
    } catch (error: any) {
      console.error('Erro ao investir:', error);
      alert(error.message || 'Erro ao realizar investimento');
      throw error;
    }
  }, [isConnected, account, xrpBalance, availableTokens, investmentProjects, fetchInvestmentProjects]);

  useEffect(() => {
    if (isConnected && account && !hasLoadedTokens) {
      // Carrega apenas uma vez quando conecta e ainda não carregou
      loadAccountData();
    } else if (!isConnected || !account) {
      // Reset quando desconecta
      setMptokens([]);
      setXrpBalance(null);
      setTokensError(null);
      setNoTokensDismissed(false);
      setHasLoadedTokens(false);
    }
  }, [isConnected, account, hasLoadedTokens, loadAccountData]);

  useEffect(() => {
    if (mptokens.length > 0) {
      setNoTokensDismissed(false);
    }
  }, [mptokens.length]);

  const handleCreateProject = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session) {
      alert('Você precisa estar logado para criar projetos');
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao criar projeto');
      }

      // Limpar formulário e fechar modal
      setFormData({
        name: '',
        type: 'LAND',
        description: '',
        purpose: '',
        example: '',
        minAmount: '',
        maxAmount: '',
        targetAmount: '',
      });
      setShowCreateModal(false);

      // Atualizar lista de projetos
      await fetchAdminProjects();

      alert('Projeto criado com sucesso!');
    } catch (error: any) {
      alert(error.message || 'Erro ao criar projeto');
    } finally {
      setIsCreating(false);
    }
  };

  const handleIssueToken = useCallback(
    async (project: AdminProject) => {
      if (!isConnected || !account) {
        setIssuanceError('Conecte sua carteira Crossmark antes de emitir tokens.');
        setIssuanceSuccess(null);
        return;
      }

      const config = TOKEN_CONFIG[project.type] ?? { decimals: 2, transferable: true };
      const decimals = config.decimals;
      const transferable = config.transferable;

      const baseUnitsNumber = Math.round(project.targetAmount * Math.pow(10, decimals));

      if (!Number.isFinite(baseUnitsNumber) || baseUnitsNumber <= 0) {
        setIssuanceError('Valor de emissão inválido. Verifique a meta do projeto.');
        setIssuanceSuccess(null);
        return;
      }

      const baseUnits = baseUnitsNumber.toString();

      const metadata: MPTokenMetadata = {
        name: project.name,
        description: project.description ?? undefined,
        purpose: project.purpose,
        // Propriedades adicionais via index signature
        type: project.type,
        example: project.example ?? undefined,
        minAmount: project.minAmount,
        maxAmount: project.maxAmount ?? undefined,
        targetAmount: project.targetAmount,
        status: project.status,
        generatedAt: new Date().toISOString(),
      } satisfies MPTokenMetadata;

      setIssuanceError(null);
      setIssuanceSuccess(null);
      setIssuingProjectId(project.id);

      try {
        const transaction = buildMPTokenIssuanceTransaction({
          issuer: account.address,
          currency: project.type,
          amount: baseUnits,
          decimals,
          transferable,
          metadata,
        });

        const response = await signAndSubmitTransaction(transaction);

        const responseError =
          (response as any)?.error ??
          (response as any)?.data?.error ??
          (response as any)?.result?.error;
        if (responseError) {
          throw new Error(responseError.message ?? 'Transação rejeitada pela Crossmark.');
        }

        const txHash = extractTransactionHash(response);

        if (!txHash) {
          throw new Error('Não foi possível identificar o hash da transação emitida.');
        }

        await registerIssuance({
          projectId: project.id,
          projectName: project.name,
          tokenType: project.type,
          currency: (transaction.Currency as string) ?? project.type,
          amount: baseUnits,
          decimals,
          issuer: account.address,
          network: account.network,
          txHash,
          metadata,
          rawResponse: response,
        });

        setIssuanceSuccess(`Token ${project.name} emitido com sucesso. TX: ${txHash}`);

        if (selectedRole === 'administrador') {
          await fetchAdminProjects();
        }

        await refreshAccount();
        setHasLoadedTokens(false); // Permite recarregar após emissão
        await loadAccountData();
      } catch (error) {
        console.error('Erro ao emitir token:', error);
        const message = error instanceof Error ? error.message : 'Falha ao emitir token.';
        setIssuanceError(message);
        try {
          // Assuming registerAction is available from @/lib/elysia-client or similar
          // This part of the code was not provided in the original file,
          // so it's commented out to avoid errors.
          // await registerAction({
          //   type: 'error',
          //   token: { currency: project.type, issuer: account?.address ?? 'unknown' },
          //   actor: account?.address ?? 'unknown',
          //   target: project.name,
          //   network: account?.network ?? 'testnet',
          //   txHash: 'n/a',
          //   metadata: { context: 'issuance', message },
          // });
        } catch (registerError) {
          console.warn('Falha ao registrar erro no Elysia:', registerError);
        }
        setIssuingProjectId(null);
      }
    },
    [
      account,
      isConnected,
      selectedRole,
      fetchAdminProjects,
      refreshAccount,
      loadAccountData,
    ],
  );

  const handleUploadFile = useCallback(async () => {
    if (!selectedProjectForUpload || !uploadFile) {
      alert('Selecione um projeto e um arquivo');
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('projectId', selectedProjectForUpload);
      if (uploadDescription) {
        formData.append('description', uploadDescription);
      }

      const response = await fetch('/api/admin/projects/files', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao fazer upload');
      }

      // Limpar formulário
      setUploadFile(null);
      setUploadDescription('');
      setShowUploadModal(false);
      setSelectedProjectForUpload(null);

      alert('Arquivo enviado com sucesso!');
    } catch (error: any) {
      alert(error.message || 'Erro ao fazer upload do arquivo');
    } finally {
      setUploadingFile(false);
    }
  }, [selectedProjectForUpload, uploadFile, uploadDescription]);

  const openUploadModal = useCallback((projectId: string) => {
    setSelectedProjectForUpload(projectId);
    setShowUploadModal(true);
  }, []);

  const steps = [
    {
      icon: Download,
      text: 'Instale a extensão Crossmark no seu navegador',
      color: 'text-blue-500 dark:text-blue-400'
    },
    {
      icon: MousePointerClick,
      text: 'Clique em "Conectar Crossmark" acima',
      color: 'text-green-500 dark:text-green-400'
    },
    {
      icon: CheckCircle2,
      text: 'Aprove a conexão na extensão',
      color: 'text-purple-500 dark:text-purple-400'
    },
    {
      icon: Sparkles,
      text: 'Visualize seus tokens MPT automaticamente',
      color: 'text-yellow-500 dark:text-yellow-400'
    }
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300 relative overflow-hidden">
      <BackgroundParticles />
      <ThemeToggle />

      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Building2 className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              Terra.FI
            </h1>
          </div>
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300">
            Plataforma de Tokenização de Terrenos na XRPL
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/tokens/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <Sparkles className="w-5 h-5" />
              Criar Tokens MPT
            </Link>
            <Link
              href="/tokens/trade"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold shadow hover:shadow-md transition-all duration-300"
            >
              <Coins className="w-5 h-5" />
              Trading Desk
            </Link>
            <Link
              href="/revenue"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold shadow hover:shadow-md transition-all duration-300"
            >
              <DollarSign className="w-5 h-5" />
              Distribuir Receitas
            </Link>
            <Link
              href="/Terra_fi.md"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold shadow hover:shadow-md transition-all duration-300"
            >
              <Info className="w-5 h-5" />
              Blueprint Terra.FI
            </Link>
          </div>
        </motion.div>

        {/* Role Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex justify-center gap-4 mb-8"
        >
          <button
            onClick={() => setSelectedRole('investidor')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${selectedRole === 'investidor'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50 dark:bg-blue-500 dark:shadow-blue-400/50'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-md hover:shadow-lg'
              }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Investidor
            </div>
          </button>
          <button
            onClick={() => setSelectedRole('administrador')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${selectedRole === 'administrador'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50 dark:bg-blue-500 dark:shadow-blue-400/50'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-md hover:shadow-lg'
              }`}
          >
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Administrador
            </div>
          </button>
        </motion.div>

        {/* Investor Panel */}
        {selectedRole === 'investidor' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 md:p-12 mb-8 border border-gray-200 dark:border-gray-700">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white mb-2">
                    Painel do Investidor
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 text-lg">
                    Visualize seus tokens MPT na XRPL
                  </p>
                </div>
                {serviceWallet ? (
                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-100 dark:bg-purple-900/30 px-4 py-2 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                          <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                            Carteira do protocolo
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg">
                      <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                        {formatAddress(serviceWallet.address)}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={copyAddress}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        aria-label="Copiar endereço"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
                      </motion.button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Rede: {serviceWallet.network.toUpperCase()} • Tipo: {serviceWallet.type}
                    </p>
                  </div>
                ) : isConnected && account ? (
                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                            Conectado
                          </span>
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDisconnect}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Desconectar
                      </motion.button>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg">
                      <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                        {formatAddress(account.address)}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={copyAddress}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        aria-label="Copiar endereço"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-500" />
                        )}
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleConnect}
                    disabled={isWalletLoading}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isWalletLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Conectando...
                      </>
                    ) : !isInstalled ? (
                      <>
                        <Download className="w-6 h-6" />
                        Instalar Crossmark
                      </>
                    ) : (
                      <>
                        <Wallet className="w-6 h-6" />
                        Conectar Crossmark
                      </>
                    )}
                  </motion.button>
                )}
              </div>

              {!serviceWallet && !isInstalled && !isConnected && !isWalletLoading && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    A extensão Crossmark não foi detectada. Baixe em{' '}
                    <a
                      className="underline hover:text-blue-600 dark:hover:text-blue-400"
                      href="https://www.crossmark.io/download"
                      target="_blank"
                      rel="noreferrer"
                    >
                      crossmark.io/download
                    </a>{' '}
                    e tente novamente.
                  </p>
                </div>
              )}

              {!serviceWallet && crossmarkError && (
                <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                  <div className="flex items-start gap-3 text-red-700 dark:text-red-300">
                    <AlertCircle className="w-5 h-5 mt-1" />
                    <p className="text-sm">{crossmarkError}</p>
                  </div>
                </div>
              )}

              {isConnected && account && (
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Rede</p>
                      <p className="font-semibold text-gray-800 dark:text-white capitalize">
                        {account.network}
                      </p>
                    </div>
                    {xrpBalance !== null && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Saldo XRP</p>
                        <p className="font-semibold text-gray-800 dark:text-white">
                          {xrpBalance.toFixed(2)} XRP
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Abas do Investidor - só aparecem quando wallet está conectada */}
              {isConnected && (
                <div className="mt-6">
                  <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setInvestorTab('available-tokens')}
                        className={`px-4 py-2 font-semibold transition-all duration-300 border-b-2 ${
                          investorTab === 'available-tokens'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          Investimentos
                        </div>
                      </button>
                      <button
                        onClick={() => setInvestorTab('my-tokens')}
                        className={`px-4 py-2 font-semibold transition-all duration-300 border-b-2 ${
                          investorTab === 'my-tokens'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Coins className="w-5 h-5" />
                          Meus Tokens
                        </div>
                      </button>
                      {session && (
                        <button
                          onClick={() => setInvestorTab('investments')}
                          className={`px-4 py-2 font-semibold transition-all duration-300 border-b-2 ${
                            investorTab === 'investments'
                              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            Meus Investimentos
                          </div>
                        </button>
                      )}
                  </div>

                {/* Conteúdo da aba Investimentos */}
                {investorTab === 'investments' && (
                  <div>
                    {isSessionPending ? (
                      <div className="flex justify-center py-12">
                        <div className="text-center">
                          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                          <p className="text-gray-600 dark:text-gray-300">Verificando autenticação...</p>
                        </div>
                      </div>
                    ) : !session ? (
                      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl p-8 text-center">
                        <Info className="w-12 h-12 text-blue-500 dark:text-blue-400 mx-auto mb-4" />
                        <p className="text-blue-700 dark:text-blue-300 text-lg mb-4">
                          Você precisa estar logado para ver os projetos de investimento.
                        </p>
                        <Link
                          href="/auth/signin"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-300"
                        >
                          Fazer Login
                          <ArrowRight className="w-5 h-5" />
                        </Link>
                      </div>
                    ) : loadingInvestments ? (
                      <div className="flex justify-center py-12">
                        <div className="text-center">
                          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                          <p className="text-gray-600 dark:text-gray-300">Carregando projetos de investimento...</p>
                        </div>
                      </div>
                    ) : investmentProjects.length === 0 ? (
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                        <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600 dark:text-gray-300 text-lg mb-4">
                          Nenhum projeto de investimento disponível no momento.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {investmentProjects.map((project) => (
                          <InvestmentCard
                            key={project.id}
                            project={project}
                            onInvest={handleInvest}
                            isMocked={isInvestmentMocked()}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Conteúdo da aba Meus Tokens */}
                {investorTab === 'my-tokens' && (
                  <div>
                    {!isConnected ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <Coins className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Conecte sua carteira para ver seus tokens</p>
                      </div>
                    ) : loadingTokens ? (
                      <div className="flex justify-center py-8">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : tokensError ? (
                      <div className="flex items-start gap-3 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
                        <AlertCircle className="w-5 h-5 mt-1" />
                        <p className="text-sm">{tokensError}</p>
                      </div>
                    ) : mptokens.length > 0 ? (
                      <div className="space-y-3">
                        {mptokens.map((token, index) => (
                          <div
                            key={`${token.currency}-${token.issuer}-${index}`}
                            className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-semibold text-gray-800 dark:text-white">
                                  {token.currency}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {token.issuer}
                                </p>
                              </div>
                              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {parseFloat(token.balance).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 6,
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <Coins className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhum token MPT encontrado</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Conteúdo da aba Investimentos Disponíveis */}
                {investorTab === 'available-tokens' && (
                  <div>
                    {loadingAvailableTokens ? (
                      <div className="flex justify-center py-12">
                        <div className="text-center">
                          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                          <p className="text-gray-600 dark:text-gray-300">Carregando investimentos disponíveis...</p>
                        </div>
                      </div>
                    ) : availableTokens.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {availableTokens.map((project) => (
                          <InvestmentCard
                            key={project.id || `${project.currency}-${project.issuer}`}
                            project={{
                              id: project.id || '',
                              name: project.name,
                              type: project.currency,
                              purpose: project.purpose,
                              example: project.example || '',
                              minAmount: project.minAmount || 0,
                              maxAmount: project.maxAmount || 0,
                              targetAmount: project.targetAmount || 0,
                              totalAmount: project.totalAmount || 0,
                              status: 'published',
                            }}
                            onInvest={handleInvest}
                            isMocked={isInvestmentMocked()}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                        <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600 dark:text-gray-300 text-lg mb-4">
                          Nenhum investimento disponível no momento.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                </div>
              )}

              {/* Animated Wallet Icon - só aparece quando não está logado nem conectado */}
              {!session && !isConnected && (
                <div className="mt-8 flex justify-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 100 }}
                    className="w-64 h-64 relative flex items-center justify-center"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-full blur-2xl animate-pulse" />
                    <motion.div
                      animate={{
                        rotate: [0, 10, -10, 10, -10, 0],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className="relative z-10"
                    >
                      <Wallet className="w-32 h-32 text-blue-600 dark:text-blue-400" />
                    </motion.div>
                    <motion.div
                      animate={{
                        rotate: 360,
                      }}
                      transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Coins className="w-16 h-16 text-yellow-500/30 dark:text-yellow-400/30 absolute -top-4 -right-4" />
                      <Zap className="w-12 h-12 text-purple-500/30 dark:text-purple-400/30 absolute -bottom-4 -left-4" />
                    </motion.div>
                  </motion.div>
                </div>
              )}
            </div>

            {/* Getting Started Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 md:p-12 border border-gray-200 dark:border-gray-700"
            >
              <h3 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white mb-8 text-center">
                Como começar?
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                      className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-300"
                    >
                      <div className={`p-3 rounded-lg bg-white dark:bg-gray-800 shadow-md ${step.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                          Passo {index + 1}
                        </span>
                        <p className="text-gray-700 dark:text-gray-300 font-medium">
                          {step.text}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Administrator Panel */}
        {selectedRole === 'administrador' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="max-w-6xl mx-auto"
          >
            {/* Header Section */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 md:p-12 mb-8 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white mb-2">
                    Painel Administrativo
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 text-lg">
                    Emita Multi-Purpose Tokens (MPTs) na XRPL
                  </p>
                </div>
                <div className="flex gap-4">
                  {session && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowCreateModal(true)}
                      className="px-6 py-4 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-500 dark:to-green-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-3"
                    >
                      <Plus className="w-6 h-6" />
                      Criar Novo Investimento
                    </motion.button>
                  )}
                  {isConnected && account ? (
                    <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600">
                      <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                        {formatAddress(account.address)}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDisconnect}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Desconectar
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleConnect}
                      disabled={isWalletLoading}
                      className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isWalletLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Conectando...
                        </>
                      ) : !isInstalled ? (
                        <>
                          <Download className="w-6 h-6" />
                          Instalar Crossmark
                        </>
                      ) : (
                        <>
                          <Wallet className="w-6 h-6" />
                          Conectar Crossmark
                        </>
                      )}
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Tabs do Admin */}
            <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setAdminTab('projects')}
                className={`px-4 py-2 font-semibold transition-all duration-300 border-b-2 ${
                  adminTab === 'projects'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Projetos
              </button>
              <button
                onClick={() => setAdminTab('investments')}
                className={`px-4 py-2 font-semibold transition-all duration-300 border-b-2 ${
                  adminTab === 'investments'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Investimentos
              </button>
              <Link
                href="/admin/mpt"
                className="px-4 py-2 font-semibold transition-all duration-300 border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Gerenciar MPTs
              </Link>
              <Link
                href="/admin/wallets"
                className="px-4 py-2 font-semibold transition-all duration-300 border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                Carteiras
              </Link>
            </div>

            {(issuanceSuccess || issuanceError) && (
              <div className="mb-6">
                {issuanceSuccess && (
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300">
                    <Info className="w-5 h-5 mt-1" />
                    <div>
                      <p className="font-semibold">Emissão registrada</p>
                      <p className="text-sm">{issuanceSuccess}</p>
                    </div>
                  </div>
                )}
                {issuanceError && (
                  <div className="mt-3 flex items-start gap-3 p-4 rounded-xl border border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                    <AlertCircle className="w-5 h-5 mt-1" />
                    <div>
                      <p className="font-semibold">Erro durante emissão</p>
                      <p className="text-sm">{issuanceError}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Conteúdo da aba Projetos */}
            {adminTab === 'projects' && (
              <>
                {/* MPT Cards Grid */}
                {loadingProjects ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300">Carregando projetos...</p>
              </div>
            ) : adminProjects.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
                <p className="text-gray-600 dark:text-gray-300 text-lg">
                  Nenhum projeto cadastrado. Execute o seed do banco de dados.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {adminProjects.map((project, index) => {
                  const Icon = typeIcons[project.type as keyof typeof typeIcons] || Mountain;
                  const colorClass = typeColors[project.type as keyof typeof typeColors] || 'from-blue-400 to-blue-600';

                  return (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      whileHover={{ scale: 1.02, y: -5 }}
                      className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-2xl transition-all duration-300"
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`p-3 bg-gradient-to-br ${colorClass} rounded-xl`}>
                          <Icon className="w-8 h-8 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
                            {project.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {project.description || project.purpose}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3 mb-6">
                        <div>
                          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">
                            Propósito:
                          </p>
                          <p className="text-gray-700 dark:text-gray-200">
                            {project.purpose}
                          </p>
                        </div>
                        {project.example && (
                          <div>
                            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">
                              Exemplo:
                            </p>
                            <p className="text-gray-700 dark:text-gray-200">
                              {project.example}
                            </p>
                          </div>
                        )}
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600 dark:text-gray-300">
                              Arrecadado: R$ {project.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-gray-600 dark:text-gray-300">
                              Meta: R$ {project.targetAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
                              style={{ width: `${Math.min((project.totalAmount / project.targetAmount) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => openUploadModal(project.id)}
                          className="flex-1 px-4 py-3 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                        >
                          <FileText className="w-5 h-5" />
                          Arquivo
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleIssueToken(project)}
                          disabled={
                            !isConnected ||
                            !account ||
                            isWalletLoading ||
                            issuingProjectId === project.id
                          }
                          className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {issuingProjectId === project.id ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Emitindo...
                            </>
                          ) : (
                            <>
                              Emitir {project.name}
                              <ArrowRight className="w-5 h-5" />
                            </>
                          )}
                        </motion.button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
              </>
            )}

            {/* Conteúdo da aba Investimentos */}
            {adminTab === 'investments' && (
              <div>
                {loadingAdminInvestments ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-300">Carregando investimentos...</p>
                  </div>
                ) : adminInvestments.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <p className="text-gray-600 dark:text-gray-300 text-lg">
                      Nenhum investimento encontrado.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Projeto
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Investidor
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Valor (R$)
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              XRP
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Data
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {adminInvestments.map((investment) => (
                            <tr key={investment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {investment.project?.name || 'N/A'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {investment.project?.type || ''}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900 dark:text-white">
                                  {investment.user?.name || 'N/A'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                  {investment.user?.walletAddress 
                                    ? `${investment.user.walletAddress.slice(0, 8)}...${investment.user.walletAddress.slice(-6)}`
                                    : 'N/A'}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                R$ {investment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {investment.xrpAmount 
                                  ? `${investment.xrpAmount.toFixed(2)} XRP`
                                  : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  investment.status === 'published' 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : investment.status === 'denied' || investment.status === 'cancelled'
                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    : investment.status === 'confirmed'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                }`}>
                                  {investment.status === 'published' ? 'Publicado' :
                                   investment.status === 'denied' ? 'Negado' :
                                   investment.status === 'cancelled' ? 'Cancelado' :
                                   investment.status === 'confirmed' ? 'Confirmado' :
                                   'Pendente'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {new Date(investment.createdAt).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex gap-2">
                                  {investment.status !== 'published' && investment.status !== 'denied' && (
                                    <>
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleUpdateInvestmentStatus(investment.id, 'published')}
                                        className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-semibold transition-all duration-300"
                                      >
                                        Publicar
                                      </motion.button>
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleUpdateInvestmentStatus(investment.id, 'denied')}
                                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-all duration-300"
                                      >
                                        Negar
                                      </motion.button>
                                    </>
                                  )}
                                  {investment.status === 'published' && (
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => handleUpdateInvestmentStatus(investment.id, 'cancelled')}
                                      className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-all duration-300"
                                    >
                                      Cancelar
                                    </motion.button>
                                  )}
                                  {investment.txHash && (
                                    <a
                                      href={`https://testnet.xrpl.org/transactions/${investment.txHash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold transition-all duration-300 inline-block"
                                    >
                                      Ver TX
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Modal de Criar Novo Investimento */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                  Criar Novo Investimento
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Nome do Projeto *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: LAND-MPT"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Tipo *
                  </label>
                  <select
                    required
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="LAND">LAND - Tokenização de Terrenos</option>
                    <option value="BUILD">BUILD - Financiamento de Construção</option>
                    <option value="REV">REV - Direitos de Receita</option>
                    <option value="COL">COL - Representação de Colateral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Fractionalized land parcel"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Propósito *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Tokenização de terrenos"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Exemplo
                  </label>
                  <input
                    type="text"
                    value={formData.example}
                    onChange={(e) => setFormData({ ...formData, example: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: 1 token = 1 m²"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Valor Mínimo (R$) *
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={formData.minAmount}
                      onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="100.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Valor Máximo (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.maxAmount}
                      onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="10000.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Meta (R$) *
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={formData.targetAmount}
                      onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="500000.00"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-xl font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-500 dark:to-green-600 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Criar Projeto
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Modal de Upload de Arquivo */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Upload className="w-6 h-6" />
                  Enviar Arquivo
                </h2>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadFile(null);
                    setUploadDescription('');
                    setSelectedProjectForUpload(null);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUploadFile();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Arquivo
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.jpg,.jpeg,.png,.gif,.txt,.csv,.json,.xml,.kml,.kmz"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Formatos permitidos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, ZIP, RAR, imagens, texto, CSV, JSON, XML, KML, KMZ (máx. 50MB)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Descrição (opcional)
                  </label>
                  <textarea
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Descreva o conteúdo do arquivo..."
                  />
                </div>

                {uploadFile && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      {uploadFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadFile(null);
                      setUploadDescription('');
                      setSelectedProjectForUpload(null);
                    }}
                    className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-xl font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingFile || !uploadFile}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {uploadingFile ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Enviar
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </main>
  );
}
