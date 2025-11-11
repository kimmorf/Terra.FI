'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { useSession } from '@/lib/auth-client';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';
import { getAccountMPTokens, getXRPBalance } from '@/lib/xrpl/account';

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
  const { data: session } = useSession();
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
  const [xrpBalance, setXrpBalance] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadAccountData = useCallback(async () => {
    if (!account) {
      return;
    }

    setLoadingTokens(true);
    setTokensError(null);

    try {
      const [tokens, balance] = await Promise.all([
        getAccountMPTokens(account.address, account.network),
        getXRPBalance(account.address, account.network),
      ]);

      setMptokens(tokens);
      setXrpBalance(balance);
    } catch (error) {
      console.error('Erro ao carregar dados da conta XRPL:', error);
      setTokensError('Não foi possível carregar os dados da conta na XRPL.');
      setMptokens([]);
      setXrpBalance(null);
    } finally {
      setLoadingTokens(false);
    }
  }, [account]);

  const handleConnect = useCallback(async () => {
    const success = await connect();
    if (success) {
      refreshAccount();
    }
  }, [connect, refreshAccount]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setMptokens([]);
    setXrpBalance(null);
    setTokensError(null);
    setCopied(false);
  }, [disconnect]);

  const copyAddress = useCallback(() => {
    if (!account?.address || typeof navigator === 'undefined') {
      return;
    }

    navigator.clipboard
      .writeText(account.address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((error) => {
        console.error('Erro ao copiar endereço:', error);
      });
  }, [account?.address]);

  const formatAddress = useCallback((address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }, []);

  useEffect(() => {
    if (selectedRole === 'administrador') {
      fetchAdminProjects();
    }
  }, [selectedRole]);

  useEffect(() => {
    if (isConnected && account) {
      loadAccountData();
    } else {
      setMptokens([]);
      setXrpBalance(null);
      setTokensError(null);
    }
  }, [isConnected, account, loadAccountData]);

  const fetchAdminProjects = async () => {
    try {
      setLoadingProjects(true);
      const response = await fetch('/api/admin/projects');
      if (response.ok) {
        const data = await response.json();
        setAdminProjects(data);
      }
    } catch (error) {
      console.error('Erro ao buscar projetos do admin:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
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
                {isConnected && account ? (
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

              {!isInstalled && !isConnected && !isWalletLoading && (
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

              {crossmarkError && (
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

              {isConnected && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                    Seus Tokens MPT
                  </h3>
                  {loadingTokens ? (
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

              {/* Animated Wallet Icon */}
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
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                      >
                        Emitir {project.name}
                        <ArrowRight className="w-5 h-5" />
                      </motion.button>
                    </motion.div>
                  );
                })}
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
      </div>
    </main>
  );
}
