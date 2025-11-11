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
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { TOKEN_PRESETS, TOKEN_CONFIG, type TokenPreset } from '@/lib/tokens/presets';

const STORAGE_KEY = 'admin:selectedWalletId';

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
  const [activeTab, setActiveTab] = useState<Tab>('listar');
  const [wallets, setWallets] = useState<ServiceWallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null),
  );

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

  const loadWallets = useCallback(async () => {
    setLoadingWallets(true);
    try {
      const data = await fetchJSON<ServiceWallet[]>('/api/admin/wallets');
      setWallets(data);
      if (data.length > 0) {
        const active = data.find((wallet) => wallet.isActive);
        const existing = data.find((wallet) => wallet.id === selectedWalletId);
        const fallback = data[0];
        const walletToUse = active ?? existing ?? fallback;
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
      await fetchJSON(`/api/admin/wallets/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: id }),
      });
      setSelectedWalletId(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, id);
      }
      await loadWallets();
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
      <ThemeToggle />

      <div className="container mx-auto px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent flex items-center gap-3">
                <Building2 className="w-10 h-10" /> Administração de MPTs
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Emita, transfira e liste Multi-Purpose Tokens (LAND, BUILD, REV, COL) usando carteiras do protocolo.
              </p>
            </div>
            <Link
              href="/admin/wallets"
              className="self-start px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2"
            >
              <WalletIcon className="w-4 h-4" /> Gerenciar carteiras
            </Link>
          </header>

          {/* Carteiras */}
          <section className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <LockKeyhole className="w-5 h-5" /> Carteira selecionada
              </h2>
              <button
                onClick={loadWallets}
                disabled={loadingWallets}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loadingWallets ? 'animate-spin' : ''}`} /> Atualizar
              </button>
            </div>

            {wallets.length === 0 ? (
              <div className="p-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 text-sm">
                Nenhuma carteira cadastrada. Use a página <Link href="/admin/wallets" className="underline">Carteiras do Protocolo</Link> para criar ou importar uma seed.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {wallets.map((wallet) => {
                  const isSelected = selectedWallet?.id === wallet.id;
                  return (
                    <button
                      key={wallet.id}
                      onClick={() => handleSelectWallet(wallet.id)}
                      className={`text-left p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                            <WalletIcon className="w-4 h-4" /> {wallet.label}
                          </h3>
                          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">
                            {wallet.address}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Tipo: {wallet.type} • Rede: {wallet.network.toUpperCase()}
                          </p>
                        </div>
                        {(wallet.isActive || isSelected) && (
                          <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                            {wallet.isActive ? 'Ativa' : 'Selecionada'}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
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
                      Tipo de Token
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
                        Supply ({selectedPreset ? TOKEN_CONFIG[selectedPreset.id].decimals : 0} decimais)
                      </label>
                      <input
                        type="text"
                        value={supply}
                        onChange={(event) => setSupply(event.target.value)}
                        placeholder={selectedPreset?.defaultSupply || '0'}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      />
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
                    disabled={issueLoading || !selectedWallet}
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
                          className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
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
                                  <span className="font-mono">{token.issuanceIdHex.slice(0, 16)}...</span>
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
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
