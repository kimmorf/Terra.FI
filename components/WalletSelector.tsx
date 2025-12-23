'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, X, RefreshCw, ChevronDown, ExternalLink, LogOut, Check, Plus } from 'lucide-react';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';

interface ServiceWallet {
  id: string;
  name: string;
  address: string;
  type: string;
  isActive: boolean;
  network: string;
  xrpBalance?: string | null;
  createdAt: string;
}

interface WalletSelectorProps {
  /** Se true, mostra só carteiras de serviço (admin). Se false, mostra Crossmark + serviço */
  adminMode?: boolean;
  /** Callback quando uma carteira de serviço é selecionada */
  onServiceWalletSelect?: (wallet: ServiceWallet) => void;
  /** Carteira de serviço atualmente selecionada */
  selectedServiceWallet?: ServiceWallet | null;
  /** Mostrar botão compacto ou expandido */
  compact?: boolean;
}

const EXPLORER_URLS = {
  mainnet: 'https://livenet.xrpl.org',
  testnet: 'https://testnet.xrpl.org',
  devnet: 'https://devnet.xrpl.org'
};

function getExplorerUrl(network: string, type: 'account' | 'tx', value: string): string {
  const baseUrl = EXPLORER_URLS[network as keyof typeof EXPLORER_URLS] || EXPLORER_URLS.testnet;
  if (type === 'account') return `${baseUrl}/accounts/${value}`;
  return `${baseUrl}/transactions/${value}`;
}

function shortenAddress(address: string, chars = 6): string {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function WalletSelector({ 
  adminMode = false, 
  onServiceWalletSelect,
  selectedServiceWallet,
  compact = false 
}: WalletSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [serviceWallets, setServiceWallets] = useState<ServiceWallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [activeTab, setActiveTab] = useState<'crossmark' | 'service'>(adminMode ? 'service' : 'crossmark');
  
  const crossmark = useCrossmarkContext();

  // Carregar carteiras de serviço
  const loadServiceWallets = useCallback(async () => {
    setLoadingWallets(true);
    try {
      const res = await fetch('/api/admin/wallets');
      if (res.ok) {
        const data = await res.json();
        setServiceWallets(data.wallets || []);
      }
    } catch (error) {
      console.error('Erro ao carregar carteiras:', error);
    } finally {
      setLoadingWallets(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadServiceWallets();
    }
  }, [isOpen, loadServiceWallets]);

  // Restaurar carteira selecionada do localStorage
  useEffect(() => {
    if (adminMode && !selectedServiceWallet && serviceWallets.length > 0) {
      const savedId = localStorage.getItem('terrafi:selected-service-wallet');
      if (savedId) {
        const found = serviceWallets.find(w => w.id === savedId);
        if (found && onServiceWalletSelect) {
          onServiceWalletSelect(found);
        }
      } else {
        // Seleciona a primeira carteira ativa por padrão
        const active = serviceWallets.find(w => w.isActive) || serviceWallets[0];
        if (active && onServiceWalletSelect) {
          onServiceWalletSelect(active);
        }
      }
    }
  }, [adminMode, selectedServiceWallet, serviceWallets, onServiceWalletSelect]);

  const handleSelectServiceWallet = async (wallet: ServiceWallet) => {
    // IMPORTANTE: Desconectar Crossmark ao selecionar ServiceWallet
    // Só pode haver UM tipo de carteira ativa por vez
    if (crossmark.isConnected) {
      console.log('[WalletSelector] Desconectando Crossmark para usar ServiceWallet');
      await crossmark.disconnect();
    }
    
    localStorage.setItem('terrafi:selected-service-wallet', wallet.id);
    // Limpar flag de Crossmark selecionada
    localStorage.removeItem('terrafi:use-crossmark');
    
    if (onServiceWalletSelect) {
      onServiceWalletSelect(wallet);
    }
    setIsOpen(false);
  };

  const handleConnectCrossmark = async () => {
    // IMPORTANTE: Limpar ServiceWallet ao conectar Crossmark
    // Só pode haver UM tipo de carteira ativa por vez
    localStorage.removeItem('terrafi:selected-service-wallet');
    localStorage.setItem('terrafi:use-crossmark', 'true');
    
    // Limpar seleção de ServiceWallet se houver callback
    if (onServiceWalletSelect) {
      // @ts-ignore - passando null para limpar
      onServiceWalletSelect(null);
    }
    
    await crossmark.connect();
    setIsOpen(false);
  };

  const handleDisconnectCrossmark = async () => {
    localStorage.removeItem('terrafi:use-crossmark');
    await crossmark.disconnect();
  };

  // Determinar o que mostrar no botão
  const getButtonContent = () => {
    if (adminMode && selectedServiceWallet) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[120px]">
              {selectedServiceWallet.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {shortenAddress(selectedServiceWallet.address)}
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </div>
      );
    }

    if (!adminMode && crossmark.isConnected && crossmark.account) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {shortenAddress(crossmark.account.address)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {crossmark.account.network}
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-gray-500" />
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {compact ? 'Conectar' : 'Conectar Carteira'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-500" />
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Botão principal */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
      >
        {getButtonContent()}
      </button>

      {/* Modal/Popup */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Selecionar Carteira
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Tabs (apenas se não for adminMode) */}
            {!adminMode && (
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab('crossmark')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                    activeTab === 'crossmark'
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  🔗 Crossmark
                </button>
                <button
                  onClick={() => setActiveTab('service')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                    activeTab === 'service'
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  🏦 Carteiras do Protocolo
                </button>
              </div>
            )}

            {/* Conteúdo */}
            <div className="max-h-80 overflow-y-auto">
              {/* Tab Crossmark */}
              {activeTab === 'crossmark' && !adminMode && (
                <div className="p-4 space-y-4">
                  {crossmark.isConnected && crossmark.account ? (
                    <>
                      {/* Carteira conectada */}
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                            <Wallet className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {crossmark.account.address}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                              Rede: {crossmark.account.network}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mt-4">
                          <a
                            href={getExplorerUrl(crossmark.account.network, 'account', crossmark.account.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Ver no Explorer
                          </a>
                          <button
                            onClick={handleDisconnectCrossmark}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                          >
                            <LogOut className="w-4 h-4" />
                            Desconectar
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Conectar Crossmark */}
                      <div className="text-center py-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
                          <Wallet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Conecte sua Carteira
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                          Use a extensão Crossmark para conectar sua carteira XRPL
                        </p>
                        
                        {crossmark.error && (
                          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-600 dark:text-red-400">{crossmark.error}</p>
                          </div>
                        )}

                        <button
                          onClick={handleConnectCrossmark}
                          disabled={crossmark.isLoading}
                          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold disabled:opacity-50 transition flex items-center justify-center gap-2"
                        >
                          {crossmark.isLoading ? (
                            <>
                              <RefreshCw className="w-5 h-5 animate-spin" />
                              Conectando...
                            </>
                          ) : (
                            <>
                              <Wallet className="w-5 h-5" />
                              Conectar Crossmark
                            </>
                          )}
                        </button>

                        {!crossmark.isInstalled && (
                          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            Não tem a extensão?{' '}
                            <a 
                              href="https://crossmark.io/" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Instalar Crossmark
                            </a>
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tab Carteiras de Serviço */}
              {(activeTab === 'service' || adminMode) && (
                <div className="p-4">
                  {loadingWallets ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : serviceWallets.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <Wallet className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nenhuma carteira encontrada
                      </p>
                      <a
                        href="/admin/wallets"
                        className="mt-3 inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Plus className="w-4 h-4" />
                        Criar nova carteira
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {serviceWallets.map((wallet) => (
                        <button
                          key={wallet.id}
                          onClick={() => handleSelectServiceWallet(wallet)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                            selectedServiceWallet?.id === wallet.id
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                              : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            wallet.type === 'issuer' 
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                              : wallet.type === 'distribution'
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                              : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                          }`}>
                            <Wallet className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-white">
                                {wallet.name}
                              </p>
                              {wallet.isActive && (
                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs rounded-full">
                                  Ativa
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {shortenAddress(wallet.address)} • {wallet.type}
                            </p>
                          </div>
                          {selectedServiceWallet?.id === wallet.id && (
                            <Check className="w-5 h-5 text-emerald-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <button
                onClick={loadServiceWallets}
                disabled={loadingWallets}
                className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${loadingWallets ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

