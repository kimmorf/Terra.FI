'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet as WalletIcon,
  KeyRound,
  ShieldCheck,
  Trash2,
  Copy,
  RefreshCw,
  Plus,
  LockKeyhole,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';

interface ServiceWallet {
  id: string;
  label: string;
  document?: string | null;
  type: string;
  network: 'testnet' | 'mainnet' | 'devnet';
  address: string;
  publicKey?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'admin:selectedWalletId';

export default function AdminWalletsPage() {
  const [wallets, setWallets] = useState<ServiceWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [document, setDocument] = useState('');
  const [type, setType] = useState<'issuer' | 'user' | 'admin'>('issuer');
  const [network, setNetwork] = useState<'testnet' | 'mainnet' | 'devnet'>('testnet');
  const [seed, setSeed] = useState('');
  const [fund, setFund] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) || null,
    [wallets, selectedWalletId],
  );

  const loadWallets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/wallets');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao carregar carteiras');
      }
      const data = (await response.json()) as ServiceWallet[];
      setWallets(data);

      // Define seleção automática com base no banco
      const active = data.find((wallet) => wallet.isActive) || data[0] || null;
      if (active) {
        setSelectedWalletId(active.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, active.id);
        }
      } else {
        setSelectedWalletId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar carteiras');
      setWallets([]);
      setSelectedWalletId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallets();
  }, []);

  const handleCreate = async () => {
    if (!label.trim()) {
      setError('Informe um nome para a carteira');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          document: document.trim() || undefined,
          type,
          network,
          seed: seed.trim() || undefined,
          fund,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao criar carteira');
      }

      const wallet = (await response.json()) as ServiceWallet;

      // Seleciona automaticamente a carteira recém criada
      await selectWalletOnServer(wallet.id);
      
      if (typeof window !== 'undefined') {
        // Disparar evento customizado para notificar outras páginas
        window.dispatchEvent(new CustomEvent('walletSelected', { detail: { walletId: wallet.id } }));
        window.dispatchEvent(new Event('storage'));
      }
      
      setSuccess('Carteira criada e selecionada com sucesso!');
      setLabel('');
      setDocument('');
      setSeed('');
      setType('issuer');
      setNetwork('testnet');
      setFund(true);

      await loadWallets();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar carteira');
    } finally {
      setCreating(false);
    }
  };

  const selectWalletOnServer = async (id: string) => {
    const response = await fetch('/api/admin/wallets/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId: id }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao selecionar carteira');
    }
  };

  const handleSelect = async (id: string) => {
    try {
      await selectWalletOnServer(id);
      setSelectedWalletId(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, id);
        
        // Disparar evento customizado para notificar outras páginas/componentes
        // que a carteira foi alterada
        window.dispatchEvent(new CustomEvent('walletSelected', { detail: { walletId: id } }));
        
        // Também dispara evento storage para compatibilidade
        window.dispatchEvent(new Event('storage'));
      }
      setSuccess('Carteira selecionada para operações administrativas.');
      await loadWallets();
    } catch (err: any) {
      setError(err.message || 'Erro ao selecionar carteira');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover esta carteira?')) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/wallets/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao remover carteira');
      }
      if (selectedWalletId === id) {
        setSelectedWalletId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      await loadWallets();
    } catch (err: any) {
      setError(err.message || 'Erro ao remover carteira');
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccess('Copiado para a área de transferência!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError('Não foi possível copiar para a área de transferência.');
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
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent flex items-center gap-3">
                <WalletIcon className="w-10 h-10" />
                Carteiras do Protocolo
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-2xl">
                Gere e armazene carteiras administrativas do Terra.Fi. As seeds são cifradas
                automaticamente para uso neste ambiente de testes. Selecione uma carteira para usá-la nos
                fluxos de emissão, freeze ou clawback.
              </p>
            </div>
            <button
              onClick={loadWallets}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                <Plus className="w-5 h-5" />
                Criar nova carteira
              </h2>

              {error && (
                <div className="mb-4 border border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-xl px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 border border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-xl px-3 py-2 text-sm">
                  {success}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Nome / Apelido
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Ex: Emissor LAND - Testnet"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Documento / Referência (opcional)
                  </label>
                  <input
                    type="text"
                    value={document}
                    onChange={(event) => setDocument(event.target.value)}
                    placeholder="Ex: CNPJ 12.345.678/0001-99"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Tipo da carteira
                  </label>
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value as typeof type)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                  >
                    <option value="issuer">Emissora (LAND/BUILD/REV/COL)</option>
                    <option value="user">Carteira de usuário / investidor</option>
                    <option value="admin">Carteira administrativa</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Rede
                    </label>
                    <select
                      value={network}
                      onChange={(event) => setNetwork(event.target.value as typeof network)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                    >
                      <option value="testnet">Testnet</option>
                      <option value="devnet">Devnet</option>
                      <option value="mainnet">Mainnet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Seed (opcional)
                    </label>
                    <input
                      type="text"
                      value={seed}
                      onChange={(event) => setSeed(event.target.value)}
                      placeholder="Informe uma seed existente ou deixe em branco"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono text-xs"
                    />
                  </div>
                </div>

                {network === 'testnet' && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={fund}
                      onChange={(event) => setFund(event.target.checked)}
                      className="rounded"
                    />
                    Financiar automaticamente via faucet (testnet)
                  </label>
                )}

                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-5 h-5" />
                      Criar carteira
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" />
                    Carteiras cadastradas ({wallets.length})
                  </h2>
                </div>

                {wallets.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                    <WalletIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>Nenhuma carteira cadastrada ainda.</p>
                    <p className="text-sm mt-1">Use o formulário ao lado para criar a primeira carteira.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {wallets.map((wallet) => {
                      const isSelected = selectedWallet?.id === wallet.id;
                      return (
                        <div
                          key={wallet.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                                  {wallet.label}
                                </h3>
                                {isSelected && (
                                  <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                                    Selecionada
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 space-y-1">
                                <p className="flex items-center gap-2 font-mono text-xs">
                                  <span className="uppercase bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1.5 py-0.5 rounded">
                                    {wallet.network}
                                  </span>
                                  {wallet.address}
                                  <button
                                    onClick={() => copyToClipboard(wallet.address)}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  Tipo: {wallet.type} • Criada em{' '}
                                  {new Date(wallet.createdAt).toLocaleString()}
                                </p>
                                {wallet.document && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Documento: {wallet.document}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleSelect(wallet.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                                  wallet.isActive
                                    ? 'bg-green-600 text-white'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                              >
                                <LockKeyhole className="w-4 h-4" />
                                {wallet.isActive ? 'Selecionada' : 'Usar carteira'}
                              </button>
                              <button
                                onClick={() => handleDelete(wallet.id)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20 transition-all flex items-center gap-1"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedWallet && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-blue-700 dark:text-blue-200">
                  <h3 className="font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Carteira selecionada
                  </h3>
                  <p className="text-sm mt-1">
                    Todas as operações administrativas (emissão de MPT, freeze, clawback) utilizarão a
                    carteira <strong>{selectedWallet.label}</strong> ({selectedWallet.address}).
                  </p>
                  <p className="text-xs mt-1 text-blue-600/70 dark:text-blue-200/70">
                    Você pode alterar a carteira a qualquer momento ou criar novas carteiras para ambientes
                    diferentes.
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}


