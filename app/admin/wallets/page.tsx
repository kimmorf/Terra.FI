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
  LogOut,
  ArrowLeft,
  Banknote,
  Send,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { WalletSelector } from '@/components/WalletSelector';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';

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
  const router = useRouter();
  const [wallets, setWallets] = useState<ServiceWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [document, setDocument] = useState('');
  const [type, setType] = useState<'issuer' | 'distribution' | 'user_internal'>('issuer');
  const [network, setNetwork] = useState<'testnet' | 'mainnet' | 'devnet'>('devnet');
  const [seed, setSeed] = useState('');
  const [fund, setFund] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fundingWalletId, setFundingWalletId] = useState<string | null>(null);
  const [fundingAll, setFundingAll] = useState(false);
  const [extraFaucetAddress, setExtraFaucetAddress] = useState('');
  const [faucetNetwork, setFaucetNetwork] = useState<'testnet' | 'devnet'>('devnet');
  const [fundingExtra, setFundingExtra] = useState(false);
  
  // Crossmark integration
  const { isConnected: isCrossmarkConnected, account: crossmarkAccount } = useCrossmarkContext();

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

      // Mantém a seleção atual do localStorage, se existir e for válida
      const currentSelectedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (currentSelectedId && data.find((w) => w.id === currentSelectedId)) {
        // Carteira selecionada ainda existe
        setSelectedWalletId(currentSelectedId);
      } else if (data.length > 0 && !currentSelectedId) {
        // Se não tem seleção e há carteiras, seleciona a primeira automaticamente
        const first = data[0];
        setSelectedWalletId(first.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, first.id);
        }
      } else {
        // Nenhuma carteira disponível
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

      // Seleciona automaticamente a carteira recém criada (apenas localmente)
      setSelectedWalletId(wallet.id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, wallet.id);
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

  const handleSelect = async (id: string) => {
    try {
      // Seleciona apenas localmente (localStorage), sem modificar banco de dados
      setSelectedWalletId(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, id);
        
        // Disparar evento customizado para notificar outras páginas/componentes
        // que a carteira foi alterada
        window.dispatchEvent(new CustomEvent('walletSelected', { detail: { walletId: id } }));
        
        // Também dispara evento storage para compatibilidade
        window.dispatchEvent(new Event('storage'));
      }
      setSuccess('Carteira conectada para operações nesta máquina/sessão.');
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar carteira');
    }
  };

  const handleDisconnect = () => {
    try {
      if (!selectedWalletId) {
        setSuccess('Nenhuma carteira conectada no momento.');
        return;
      }
      const previousWalletId = selectedWalletId;
      setSelectedWalletId(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(
          new CustomEvent('walletSelected', { detail: { walletId: null, previousWalletId } }),
        );
        window.dispatchEvent(new Event('storage'));
      }
      setSuccess('Carteira desconectada nesta máquina/sessão.');
    } catch (err: any) {
      setError(err.message || 'Erro ao desconectar carteira');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar esta carteira?')) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/wallets/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao deletar carteira');
      }
      if (selectedWalletId === id) {
        setSelectedWalletId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
          window.dispatchEvent(
            new CustomEvent('walletSelected', { detail: { walletId: null, previousWalletId: id } }),
          );
          window.dispatchEvent(new Event('storage'));
        }
      }
      setSuccess('Carteira deletada com sucesso.');
      await loadWallets();
    } catch (err: any) {
      setError(err.message || 'Erro ao deletar carteira');
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

  const handleFund = async (walletId: string) => {
    setFundingWalletId(walletId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/wallets/${walletId}`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao fundar carteira');
      }
      
      setSuccess(`✅ ${data.message || 'Carteira fundada com sucesso!'}`);
      await loadWallets();
    } catch (err: any) {
      setError(err.message || 'Erro ao fundar carteira');
    } finally {
      setFundingWalletId(null);
    }
  };

  // Função para fundar um endereço individual via faucet
  const fundAddressViaFaucet = async (address: string, network: 'testnet' | 'devnet'): Promise<{ success: boolean; message: string }> => {
    const faucetUrls: Record<string, string> = {
      testnet: 'https://faucet.altnet.rippletest.net/accounts',
      devnet: 'https://faucet.devnet.rippletest.net/accounts',
    };
    
    const faucetUrl = faucetUrls[network];
    if (!faucetUrl) {
      return { success: false, message: 'Rede não suportada para faucet' };
    }
    
    try {
      const response = await fetch(faucetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: address,
          xrpAmount: '1000',
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, message: `Faucet retornou ${response.status}: ${errorText.slice(0, 100)}` };
      }
      
      const data = await response.json();
      return { success: true, message: `Fundado com ${data.amount || '1000'} XRP na ${network}` };
    } catch (error: any) {
      return { success: false, message: error.message || 'Erro desconhecido' };
    }
  };

  const handleFundAll = async () => {
    // Filtrar carteiras pela rede selecionada
    const walletsToFund = wallets.filter(w => w.network === faucetNetwork);
    
    // Contar endereços adicionais
    const hasExtraAddress = extraFaucetAddress.trim().startsWith('r');
    const hasCrossmark = isCrossmarkConnected && crossmarkAccount?.address;
    
    const totalAddresses = walletsToFund.length + (hasExtraAddress ? 1 : 0) + (hasCrossmark ? 1 : 0);
    
    if (totalAddresses === 0) {
      setError(`Nenhuma carteira disponível para fundar na ${faucetNetwork}`);
      return;
    }

    const confirmMsg = [
      `Fundar ${walletsToFund.length} carteira(s) do protocolo`,
      hasCrossmark ? `+ Crossmark (${crossmarkAccount?.address?.slice(0, 8)}...)` : '',
      hasExtraAddress ? `+ Endereço extra (${extraFaucetAddress.slice(0, 8)}...)` : '',
      `\n\nRede: ${faucetNetwork.toUpperCase()}\nIsso pode levar alguns minutos.`
    ].filter(Boolean).join('\n');

    if (!confirm(confirmMsg)) {
      return;
    }

    setFundingAll(true);
    setError(null);
    setSuccess(null);

    const results: string[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      // 1. Fundar carteiras do protocolo via API
      if (walletsToFund.length > 0) {
        const response = await fetch('/api/admin/wallets/fund-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: faucetNetwork }),
        });

        const data = await response.json();

        if (response.ok) {
          successCount += data.successCount || 0;
          failCount += data.failCount || 0;
          results.push(`Protocolo: ${data.successCount} sucesso, ${data.failCount} falhas`);
        } else {
          failCount += walletsToFund.length;
          results.push(`Protocolo: Erro - ${data.error}`);
        }
      }

      // 2. Fundar Crossmark se conectada
      if (hasCrossmark && crossmarkAccount?.address) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // delay entre requisições
        const result = await fundAddressViaFaucet(crossmarkAccount.address, faucetNetwork);
        if (result.success) {
          successCount++;
          results.push(`Crossmark: ✅ ${result.message}`);
        } else {
          failCount++;
          results.push(`Crossmark: ❌ ${result.message}`);
        }
      }

      // 3. Fundar endereço extra se informado
      if (hasExtraAddress) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // delay entre requisições
        const result = await fundAddressViaFaucet(extraFaucetAddress.trim(), faucetNetwork);
        if (result.success) {
          successCount++;
          results.push(`Extra: ✅ ${result.message}`);
          setExtraFaucetAddress(''); // limpar após sucesso
        } else {
          failCount++;
          results.push(`Extra: ❌ ${result.message}`);
        }
      }

      setSuccess(
        `✅ Faucet concluído: ${successCount} sucesso, ${failCount} falhas\n${results.join('\n')}`
      );
      await loadWallets();
    } catch (err: any) {
      setError(err.message || 'Erro ao fundar carteiras');
    } finally {
      setFundingAll(false);
    }
  };

  // Fundar apenas a Crossmark
  const handleFundCrossmark = async () => {
    if (!isCrossmarkConnected || !crossmarkAccount?.address) {
      setError('Crossmark não conectada');
      return;
    }

    setFundingExtra(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await fundAddressViaFaucet(crossmarkAccount.address, faucetNetwork);
      if (result.success) {
        setSuccess(`✅ Crossmark fundada: ${result.message}`);
      } else {
        setError(`❌ Falha ao fundar Crossmark: ${result.message}`);
      }
    } finally {
      setFundingExtra(false);
    }
  };

  // Fundar apenas o endereço extra
  const handleFundExtra = async () => {
    if (!extraFaucetAddress.trim().startsWith('r')) {
      setError('Informe um endereço XRPL válido (começa com r)');
      return;
    }

    setFundingExtra(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await fundAddressViaFaucet(extraFaucetAddress.trim(), faucetNetwork);
      if (result.success) {
        setSuccess(`✅ Endereço fundado: ${result.message}`);
        setExtraFaucetAddress('');
      } else {
        setError(`❌ Falha ao fundar: ${result.message}`);
      }
    } finally {
      setFundingExtra(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300 relative overflow-hidden">
      <BackgroundParticles />
      
      {/* Header com Wallet e Theme Toggle */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <WalletSelector adminMode={true} />
      <ThemeToggle />
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          <div className="flex items-center justify-between mb-8">
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
                  <WalletIcon className="w-8 h-8 md:w-10 md:h-10" />
                Carteiras do Protocolo
              </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-2xl text-sm md:text-base">
                Gere e armazene carteiras administrativas do Terra.Fi. As seeds são cifradas
                automaticamente para uso neste ambiente de testes. Selecione uma carteira para usá-la nos
                fluxos de emissão, freeze ou clawback.
              </p>
              </div>
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
                    <option value="distribution">Distribuição</option>
                    <option value="user_internal">Usuário / Investidor</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Rede
                    </label>
                    <div className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-between">
                      <span className="font-medium">DevNet</span>
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                        Padrão
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Seleção de rede será implementada futuramente
                    </p>
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

                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={fund}
                      onChange={(event) => setFund(event.target.checked)}
                      className="rounded"
                    />
                  Financiar automaticamente via faucet (DevNet)
                  </label>

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
                  <button
                    onClick={loadWallets}
                    disabled={loading}
                    className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center gap-1 disabled:opacity-50"
                    title="Atualizar lista"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
                </div>

                {/* Seção de Faucet */}
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-4">
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-3 flex items-center gap-2">
                    <Banknote className="w-4 h-4" />
                    Faucet XRPL (Obter XRP de teste)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    {/* Seletor de Rede */}
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Rede</label>
                      <select
                        value={faucetNetwork}
                        onChange={(e) => setFaucetNetwork(e.target.value as 'testnet' | 'devnet')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
                      >
                        <option value="devnet">DevNet</option>
                        <option value="testnet">Testnet</option>
                      </select>
                    </div>
                    
                    {/* Endereço Extra */}
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                        Endereço extra (opcional)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={extraFaucetAddress}
                          onChange={(e) => setExtraFaucetAddress(e.target.value)}
                          placeholder="rXXXX..."
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
                        />
                        {extraFaucetAddress.trim().startsWith('r') && (
                          <button
                            onClick={handleFundExtra}
                            disabled={fundingExtra}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
                            title="Enviar faucet para este endereço"
                          >
                            {fundingExtra ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info Crossmark */}
                  {isCrossmarkConnected && crossmarkAccount?.address && (
                    <div className="flex items-center gap-2 mb-3 p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-sm">
                      <WalletIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-purple-700 dark:text-purple-300">
                        Crossmark: {crossmarkAccount.address.slice(0, 10)}...{crossmarkAccount.address.slice(-6)}
                      </span>
                      <button
                        onClick={handleFundCrossmark}
                        disabled={fundingExtra}
                        className="ml-auto px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs disabled:opacity-50 flex items-center gap-1"
                      >
                        {fundingExtra ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
                        Fundar
                      </button>
                    </div>
                  )}

                  {/* Botão principal */}
                  <button
                    onClick={handleFundAll}
                    disabled={fundingAll || fundingWalletId !== null || fundingExtra}
                    className="w-full px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                    title="Enviar faucet para todas as carteiras"
                  >
                    {fundingAll ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Enviando faucet...
                      </>
                    ) : (
                      <>
                        <Banknote className="w-4 h-4" />
                        Enviar faucet p/todos ({faucetNetwork})
                        {isCrossmarkConnected && ' + Crossmark'}
                        {extraFaucetAddress.trim().startsWith('r') && ' + Extra'}
                      </>
                    )}
                  </button>
                  
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    Envia 1000 XRP de teste para cada carteira na rede {faucetNetwork}
                  </p>
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
                                    Logada
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

                            <div className="flex flex-wrap items-center gap-3">
                              {!isSelected ? (
                                <button
                                  onClick={() => handleSelect(wallet.id)}
                                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center gap-2"
                                >
                                  <LockKeyhole className="w-4 h-4" />
                                  Logar
                                </button>
                              ) : (
                                <>
                                  <span className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white flex items-center gap-2">
                                    <LockKeyhole className="w-4 h-4" />
                                    Logada
                                  </span>
                                  <button
                                    onClick={handleDisconnect}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all flex items-center gap-2"
                                  >
                                    <LogOut className="w-4 h-4" />
                                    Desconectar
                                  </button>
                                </>
                              )}
                              {/* Botão de fundar (só para testnet/devnet) */}
                              {wallet.network !== 'mainnet' && (
                                <button
                                  onClick={() => handleFund(wallet.id)}
                                  disabled={fundingWalletId === wallet.id}
                                  className="px-3 py-2 rounded-lg text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20 transition-all flex items-center gap-1 disabled:opacity-50"
                                  title="Fundar carteira via faucet"
                                >
                                  {fundingWalletId === wallet.id ? (
                                    <>
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                      Fundando...
                                    </>
                                  ) : (
                                    <>
                                      <Banknote className="w-4 h-4" />
                                      Fundar
                                    </>
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(wallet.id)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20 transition-all flex items-center gap-1"
                              >
                                <Trash2 className="w-4 h-4" />
                                Deletar
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
                    Carteira conectada
                  </h3>
                  <p className="text-sm mt-1">
                    Você está logado com a carteira <strong>{selectedWallet.label}</strong> (
                    {selectedWallet.address}).
                  </p>
                  <p className="text-xs mt-1 text-blue-600/70 dark:text-blue-200/70">
                    Para trocar, conecte outra carteira na lista acima ou desconecte-se abaixo.
                  </p>
                  <div className="mt-3">
                    <button
                      onClick={handleDisconnect}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/80 text-blue-700 border border-blue-200 hover:bg-white transition-colors flex items-center gap-2 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-100 dark:hover:bg-blue-900/60"
                    >
                      <LogOut className="w-4 h-4" />
                      Desconectar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}


