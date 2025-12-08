'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Send,
  Sparkles,
  Layers,
  Check,
  AlertCircle,
  Copy,
  RefreshCw,
  Building2,
  Coins,
  Wallet as WalletIcon,
  LockKeyhole,
  ExternalLink,
  ArrowLeft,
  X,
  ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { WalletSelector } from '@/components/WalletSelector';
import { TOKEN_PRESETS, TOKEN_CONFIG, type TokenPreset } from '@/lib/tokens/presets';

const STORAGE_KEY = 'admin:selectedWalletId';

// URLs do explorer XRPL por rede
const EXPLORER_URLS: Record<string, string> = {
  mainnet: 'https://livenet.xrpl.org',
  testnet: 'https://testnet.xrpl.org',
  devnet: 'https://devnet.xrpl.org',
};

function getExplorerUrl(network: string, type: 'tx' | 'account' | 'mpt', hash: string): string {
  const baseUrl = EXPLORER_URLS[network] || EXPLORER_URLS.testnet;
  if (type === 'tx') return `${baseUrl}/transactions/${hash}`;
  if (type === 'account') return `${baseUrl}/accounts/${hash}`;
  if (type === 'mpt') return `${baseUrl}/mpt/${hash}`;
  return baseUrl;
}

interface ServiceWallet {
  id: string;
  label: string;
  address: string;
  network: 'testnet' | 'devnet' | 'mainnet';
  type: string;
  isActive: boolean;
  createdAt: string;
}

type Tab = 'emitir' | 'transferir' | 'listar';

type TokenSummary = {
  issuanceIdHex: string;
  assetScale: number;
  maximumAmount: string;
  transferFee: number;
  flags: Record<string, boolean>;
  metadata: Record<string, any> | null;
};

function convertToBaseUnits(value: string, decimals: number): string | null {
  const sanitized = value.replace(/,/g, '').trim();
  if (!sanitized) return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(sanitized)) return null;

  const [integerPartRaw, fractionalPartRaw = ''] = sanitized.split('.');
  if (decimals === 0 && fractionalPartRaw.length > 0) {
    return null;
  }

  const fractionalPart = (fractionalPartRaw + '0'.repeat(decimals)).slice(0, decimals);
  const integerPart = BigInt(integerPartRaw || '0');
  const fractional = BigInt(fractionalPart || '0');
  const multiplier = BigInt(10 ** decimals);

  return (integerPart * multiplier + fractional).toString();
}

async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as any)?.error || 'Erro ao processar requisição';
    throw new Error(message);
  }
  return data as T;
}

export default function AdminMPTPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('listar');
  const [wallets, setWallets] = useState<ServiceWallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null),
  );
  const [showWalletModal, setShowWalletModal] = useState(false);

  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  const [selectedPreset, setSelectedPreset] = useState<TokenPreset | null>(TOKEN_PRESETS[0]);
  const [tokenName, setTokenName] = useState('');
  const [supply, setSupply] = useState('');
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueSuccess, setIssueSuccess] = useState<string | null>(null);

  const [transferIssuanceId, setTransferIssuanceId] = useState('');
  const [transferDestination, setTransferDestination] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) || null,
    [wallets, selectedWalletId],
  );

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'emitir', label: 'Emitir MPT', icon: Sparkles },
    { id: 'transferir', label: 'Transferir MPT', icon: Send },
    { id: 'listar', label: 'MPTs Emitidos', icon: Layers },
  ];

  const loadWallets = useCallback(async (keepCurrentSelection = false) => {
    setLoadingWallets(true);
    try {
      const data = await fetchJSON<ServiceWallet[]>('/api/admin/wallets');
      setWallets(data);
      
      if (data.length > 0) {
        // Se deve manter a seleção atual (após trocar carteira manualmente)
        if (keepCurrentSelection && selectedWalletId) {
          const exists = data.find((wallet) => wallet.id === selectedWalletId);
          if (exists) {
            // Mantém a seleção atual
            return;
          }
        }
        
        // Prioridade: localStorage > carteira ativa > primeira carteira
        const storedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        const stored = storedId ? data.find((wallet) => wallet.id === storedId) : null;
        const active = data.find((wallet) => wallet.isActive);
        const fallback = data[0];
        const walletToUse = stored ?? active ?? fallback;
        
        setSelectedWalletId(walletToUse.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, walletToUse.id);
        }
      } else {
        setSelectedWalletId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('[AdminMPT] Falha ao carregar carteiras:', error);
      setWallets([]);
      setSelectedWalletId(null);
    } finally {
      setLoadingWallets(false);
    }
  }, [selectedWalletId]);

  const loadTokens = useCallback(async () => {
    if (!selectedWallet) {
      setTokens([]);
      return;
    }
    setLoadingTokens(true);
    try {
      const data = await fetchJSON<{ tokens: TokenSummary[] }>(
        `/api/mpt/list?issuer=${encodeURIComponent(selectedWallet.address)}&network=${selectedWallet.network}`,
      );
      setTokens(data.tokens || []);
    } catch (error) {
      console.error('[AdminMPT] Falha ao carregar tokens:', error);
      setTokens([]);
    } finally {
      setLoadingTokens(false);
    }
  }, [selectedWallet]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleSelectWallet = async (id: string) => {
    try {
      // Atualizar no banco (opcional - pode falhar silenciosamente)
      try {
        await fetchJSON(`/api/admin/wallets/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletId: id }),
        });
      } catch (err) {
        console.warn('[AdminMPT] Não foi possível atualizar carteira ativa no banco:', err);
      }
      
      // Sempre atualizar o estado local PRIMEIRO
      setSelectedWalletId(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, id);
      }
      
      // Fechar modal
      setShowWalletModal(false);
      
      // Recarregar wallets mantendo a seleção atual
      await loadWallets(true);
    } catch (error: any) {
      console.error('[AdminMPT] Erro ao selecionar carteira:', error);
    }
  };

  const handleEmit = async () => {
    if (!selectedWallet || !selectedPreset) {
      setIssueError('Selecione uma carteira do protocolo e um tipo de token.');
      return;
    }
    if (!tokenName.trim()) {
      setIssueError('Informe um nome para o token.');
      return;
    }

    const config = TOKEN_CONFIG[selectedPreset.id];
    const baseUnits = convertToBaseUnits(supply || selectedPreset.defaultSupply, config.decimals);
    if (!baseUnits) {
      setIssueError(`Supply inválido. Utilize até ${config.decimals} casas decimais.`);
      return;
    }

    setIssueLoading(true);
    setIssueError(null);
    setIssueSuccess(null);

    try {
      await fetchJSON('/api/mpt/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: selectedWallet.id,
          assetScale: config.decimals,
          maximumAmount: baseUnits,
          tokenType: selectedPreset.id.toLowerCase(),
          metadataOverrides: {
            name: tokenName.trim(),
            issuedAt: new Date().toISOString(),
          },
          flags: {
            canTransfer: config.transferable,
            requireAuth: true,
            canClawback: true,
          },
        }),
      });

      setIssueSuccess('Token emitido com sucesso!');
      setTokenName('');
      setSupply('');
      loadTokens();
    } catch (error: any) {
      setIssueError(error.message || 'Falha ao emitir token.');
    } finally {
      setIssueLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedWallet) {
      setTransferError('Selecione uma carteira do protocolo.');
      return;
    }
    if (!transferIssuanceId.trim() || !transferDestination.trim() || !transferAmount.trim()) {
      setTransferError('Preencha todos os campos obrigatórios.');
      return;
    }

    const tokenInfo = tokens.find((token) => token.issuanceIdHex === transferIssuanceId.trim());
    const assetScale = tokenInfo?.assetScale ?? 0;
    const amountInBaseUnits = convertToBaseUnits(transferAmount, assetScale);
    if (!amountInBaseUnits) {
      setTransferError(`Quantidade inválida. Utilize até ${assetScale} casas decimais.`);
      return;
    }

    setTransferLoading(true);
    setTransferError(null);
    setTransferSuccess(null);

    try {
      const data = await fetchJSON<{ txHash: string }>(
        '/api/mpt/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletId: selectedWallet.id,
            toAddress: transferDestination.trim(),
            mptokenIssuanceID: transferIssuanceId.trim(),
            amount: amountInBaseUnits,
            network: selectedWallet.network,
          }),
        },
      );

      setTransferSuccess(`Transferência enviada. TX: ${data.txHash.slice(0, 16)}...`);
      setTransferIssuanceId('');
      setTransferDestination('');
      setTransferAmount('');
      loadTokens();
    } catch (error: any) {
      setTransferError(error.message || 'Falha ao transferir token.');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Erro ao copiar ID do token:', error);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300 relative overflow-hidden">
      <BackgroundParticles />
      
      {/* Header com Wallet e Theme Toggle */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <WalletSelector 
          adminMode={true}
          selectedServiceWallet={selectedWallet ? {
            id: selectedWallet.id,
            name: selectedWallet.label,
            address: selectedWallet.address,
            type: selectedWallet.type,
            isActive: false,
            network: selectedWallet.network,
            createdAt: ''
          } : null}
          onServiceWalletSelect={(wallet) => {
            setSelectedWalletId(wallet.id);
            localStorage.setItem(STORAGE_KEY, wallet.id);
            // loadTokens será chamado automaticamente via useEffect quando selectedWallet mudar
          }}
        />
        <ThemeToggle />
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          {/* Header com botão voltar */}
          <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Voltar"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent flex items-center gap-3">
                  <Building2 className="w-8 h-8 md:w-10 md:h-10" /> Administração de MPTs
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm md:text-base">
                  Emita, transfira e liste Multi-Purpose Tokens (LAND, BUILD, REV, COL) usando carteiras do protocolo.
                </p>
              </div>
            </div>
            <Link
              href="/admin/wallets"
              className="self-start px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2"
            >
              <WalletIcon className="w-4 h-4" /> Gerenciar carteiras
            </Link>
          </header>

          {/* Seletor de Carteira com Popup */}
          <section className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <LockKeyhole className="w-5 h-5" /> Carteira selecionada
              </h2>
            </div>

            {wallets.length === 0 ? (
              <div className="p-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 text-sm">
                Nenhuma carteira cadastrada. Use a página <Link href="/admin/wallets" className="underline">Carteiras do Protocolo</Link> para criar ou importar uma seed.
              </div>
            ) : (
              <div className="relative">
                {/* Botão que abre o popup */}
                <button
                  onClick={() => setShowWalletModal(true)}
                  className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 hover:border-blue-400 dark:hover:border-blue-500 transition-all flex items-center justify-between gap-3"
                >
                  {selectedWallet ? (
                    <div className="flex items-center gap-3 flex-1">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                        <WalletIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="text-left flex-1">
                        <h3 className="font-semibold text-gray-800 dark:text-white">
                          {selectedWallet.label}
                        </h3>
                        <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {selectedWallet.address}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Tipo: {selectedWallet.type.toUpperCase()} • Rede: {selectedWallet.network.toUpperCase()}
                        </p>
                      </div>
                      <span className="px-3 py-1 text-xs bg-blue-600 text-white rounded-full font-semibold">
                        Selecionada
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Clique para selecionar uma carteira</span>
                  )}
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            )}
          </section>

          {/* Tabs */}
          <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg">
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-6 py-4 flex items-center justify-center gap-2 font-semibold transition-all ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {/* Emitir */}
              {activeTab === 'emitir' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Tipo de Token *
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {TOKEN_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setSelectedPreset(preset);
                            setTokenName(preset.metadata.name || '');
                            setSupply(preset.defaultSupply);
                          }}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            selectedPreset?.id === preset.id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-semibold text-sm">{preset.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{preset.summary}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Nome do Token *
                      </label>
                      <input
                        type="text"
                        value={tokenName}
                        onChange={(event) => setTokenName(event.target.value)}
                        placeholder="Ex: LAND-MPT - Parcela 12"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Supply ({selectedPreset ? TOKEN_CONFIG[selectedPreset.id].decimals : 0} decimais) <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={supply}
                        onChange={(event) => setSupply(event.target.value)}
                        placeholder={selectedPreset?.defaultSupply || '0'}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Se não informado, será usado o valor padrão do tipo de token.
                      </p>
                    </div>
                  </div>

                  {issueError && (
                    <div className="flex items-start gap-3 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300">
                      <AlertCircle className="w-5 h-5 mt-1" />
                      <p className="text-sm">{issueError}</p>
                    </div>
                  )}

                  {issueSuccess && (
                    <div className="flex items-start gap-3 p-4 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl text-green-700 dark:text-green-300">
                      <Check className="w-5 h-5 mt-1" />
                      <p className="text-sm">{issueSuccess}</p>
                    </div>
                  )}

                  <button
                    onClick={handleEmit}
                    disabled={
                      issueLoading ||
                      !selectedWallet ||
                      !selectedPreset ||
                      !tokenName.trim()
                    }
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {issueLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Emitindo...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" /> Emitir MPT
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Transferir */}
              {activeTab === 'transferir' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      MPTokenIssuanceID (Hex) *
                    </label>
                    <input
                      type="text"
                      value={transferIssuanceId}
                      onChange={(event) => setTransferIssuanceId(event.target.value)}
                      placeholder="Cole o ID do token emitido"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ou selecione um token da lista abaixo.</p>
                  </div>

                  {tokens.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Selecionar Token Emitido
                      </label>
                      <select
                        onChange={(event) => {
                          const token = tokens.find((t) => t.issuanceIdHex === event.target.value);
                          if (token) {
                            setTransferIssuanceId(token.issuanceIdHex);
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      >
                        <option value="">Selecione um token...</option>
                        {tokens.map((token) => (
                          <option key={token.issuanceIdHex} value={token.issuanceIdHex}>
                            {(token.metadata?.name as string) || 'Token'} - {token.issuanceIdHex.slice(0, 12)}...
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Destino (endereço XRPL) *
                      </label>
                      <input
                        type="text"
                        value={transferDestination}
                        onChange={(event) => setTransferDestination(event.target.value)}
                        placeholder="r..."
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Quantidade *
                      </label>
                      <input
                        type="text"
                        value={transferAmount}
                        onChange={(event) => setTransferAmount(event.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      />
                    </div>
                  </div>

                  {transferError && (
                    <div className="flex items-start gap-3 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300">
                      <AlertCircle className="w-5 h-5 mt-1" />
                      <p className="text-sm">{transferError}</p>
                    </div>
                  )}

                  {transferSuccess && (
                    <div className="flex items-start gap-3 p-4 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl text-green-700 dark:text-green-300">
                      <Check className="w-5 h-5 mt-1" />
                      <p className="text-sm">{transferSuccess}</p>
                    </div>
                  )}

                  <button
                    onClick={handleTransfer}
                    disabled={transferLoading || !selectedWallet}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {transferLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Transferindo...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" /> Transferir MPT
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Listar */}
              {activeTab === 'listar' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                      MPTs Emitidos ({tokens.length})
                    </h3>
                    <button
                      onClick={loadTokens}
                      disabled={loadingTokens || !selectedWallet}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingTokens ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                  </div>

                  {loadingTokens ? (
                    <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      Carregando tokens emitidos...
                    </div>
                  ) : tokens.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                      <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" /> Nenhum token emitido para esta carteira.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tokens.map((token) => (
                        <div
                          key={token.issuanceIdHex}
                          className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Coins className="w-5 h-5 text-blue-500" />
                                <span className="font-semibold text-gray-800 dark:text-white">
                                  {(token.metadata?.name as string) || 'Token sem nome'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 mb-2">
                                <div className="flex items-center gap-2">
                                  <strong>ID:</strong>
                                  <a
                                    href={getExplorerUrl(selectedWallet?.network || 'testnet', 'mpt', token.issuanceIdHex)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                                  >
                                    {token.issuanceIdHex.slice(0, 16)}...
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                  <button
                                    onClick={() => handleCopyId(token.issuanceIdHex)}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                    title="Copiar ID completo"
                                  >
                                    <Copy className={`w-3 h-3 ${copiedId === token.issuanceIdHex ? 'text-green-500' : ''}`} />
                                  </button>
                                </div>
                                <span><strong>AssetScale:</strong> {token.assetScale}</span>
                                <span><strong>MaxAmount:</strong> {token.maximumAmount}</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {token.flags.requireAuth && (
                                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                                    RequireAuth
                                  </span>
                                )}
                                {token.flags.canTransfer && (
                                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs">
                                    Transferível
                                  </span>
                                )}
                                {token.flags.canClawback && (
                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                                    Clawback
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <a
                                href={getExplorerUrl(selectedWallet?.network || 'testnet', 'mpt', token.issuanceIdHex)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" /> Explorer
                              </a>
                              <button
                                onClick={() => {
                                  setTransferIssuanceId(token.issuanceIdHex);
                                  setActiveTab('transferir');
                                }}
                                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                              >
                                <Send className="w-3 h-3" /> Transferir
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Modal de Seleção de Carteira */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
          >
            {/* Header do Modal */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <WalletIcon className="w-6 h-6" />
                Selecionar Carteira
              </h2>
              <button
                onClick={() => setShowWalletModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            {/* Lista de Carteiras */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {loadingWallets ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Carregando carteiras...</p>
                </div>
              ) : wallets.length === 0 ? (
                <div className="text-center py-8">
                  <WalletIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-500 dark:text-gray-400">Nenhuma carteira disponível.</p>
                  <Link
                    href="/admin/wallets"
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
                  >
                    Criar Carteira
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {wallets.map((wallet) => {
                    const isSelected = selectedWallet?.id === wallet.id;
                    return (
                      <button
                        key={wallet.id}
                        onClick={() => handleSelectWallet(wallet.id)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:border-blue-300 dark:hover:border-blue-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-200 dark:bg-blue-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                              <WalletIcon className={`w-5 h-5 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-800 dark:text-white truncate">
                                {wallet.label}
                              </h3>
                              <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                                {wallet.address}
                              </p>
                              <div className="flex gap-2 mt-1">
                                <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs">
                                  {wallet.type.toUpperCase()}
                                </span>
                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs">
                                  {wallet.network.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer do Modal */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <button
                onClick={() => loadWallets()}
                disabled={loadingWallets}
                className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loadingWallets ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
              <button
                onClick={() => setShowWalletModal(false)}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}
