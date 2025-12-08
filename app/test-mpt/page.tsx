'use client';

import { useState } from 'react';
import { ExternalLink, Copy, Check, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { WalletSelector } from '@/components/WalletSelector';

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

export default function TestMPTPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Form state
  const [walletId, setWalletId] = useState('');
  const [tokenName, setTokenName] = useState('LAND-TEST-001');
  const [supply, setSupply] = useState('100000');
  const [decimals, setDecimals] = useState(2);
  
  // Listar wallets
  const [wallets, setWallets] = useState<any[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  
  // MPTs criados
  const [mpts, setMpts] = useState<any[]>([]);
  const [loadingMpts, setLoadingMpts] = useState(false);
  
  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };
  
  const selectedWallet = wallets.find(w => w.id === walletId);
  const currentNetwork = selectedWallet?.network || 'testnet';

  const loadWallets = async () => {
    setLoadingWallets(true);
    try {
      const res = await fetch('/api/admin/wallets');
      const data = await res.json();
      if (Array.isArray(data)) {
        setWallets(data);
        if (data.length > 0 && !walletId) {
          setWalletId(data[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingWallets(false);
    }
  };

  const loadMPTs = async () => {
    if (!walletId) {
      setError('Selecione uma carteira primeiro');
      return;
    }
    
    const selectedWallet = wallets.find(w => w.id === walletId);
    if (!selectedWallet) return;
    
    setLoadingMpts(true);
    try {
      const res = await fetch(`/api/mpt/list?issuer=${selectedWallet.address}&network=${selectedWallet.network}`);
      const data = await res.json();
      setMpts(data.tokens || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMpts(false);
    }
  };

  const createMPT = async () => {
    if (!walletId) {
      setError('Selecione uma carteira');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Converter supply para unidades base
      const multiplier = Math.pow(10, decimals);
      const supplyInBaseUnits = (parseFloat(supply) * multiplier).toString();

      const res = await fetch('/api/mpt/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId,
          assetScale: decimals,
          maximumAmount: supplyInBaseUnits,
          tokenType: 'land',
          metadataOverrides: {
            name: tokenName,
            description: `Token de teste criado em ${new Date().toISOString()}`,
          },
          flags: {
            canTransfer: true,
            requireAuth: false, // Simplificado - sem auth necessária
            canClawback: true,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar MPT');
      }

      setResult(data);
      
      // Recarregar lista de MPTs
      await loadMPTs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-8 relative">
      {/* Header com Wallet Selector */}
      <div className="fixed top-4 right-4 z-50">
        <WalletSelector adminMode={true} />
      </div>
      
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">
            🧪 Teste de Criação de MPT
          </h1>
        </div>

        {/* Seção 1: Carregar Carteiras */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
            1️⃣ Selecionar Carteira
          </h2>
          
          <button
            onClick={loadWallets}
            disabled={loadingWallets}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 mb-4"
          >
            {loadingWallets ? 'Carregando...' : 'Carregar Carteiras'}
          </button>

          {wallets.length > 0 && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Carteira Emissora:
              </label>
              <select
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Selecione...</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} - {w.address.slice(0, 10)}... ({w.network})
                  </option>
                ))}
              </select>
              
              {walletId && (
                <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
                  <p><strong>ID:</strong> {walletId}</p>
                  <p><strong>Endereço:</strong> {wallets.find(w => w.id === walletId)?.address}</p>
                  <p><strong>Rede:</strong> {wallets.find(w => w.id === walletId)?.network}</p>
                </div>
              )}
            </div>
          )}

          {wallets.length === 0 && !loadingWallets && (
            <p className="text-yellow-600 dark:text-yellow-400 mt-4">
              ⚠️ Nenhuma carteira encontrada. Crie uma em <a href="/admin/wallets" className="underline">/admin/wallets</a>
            </p>
          )}
        </div>

        {/* Seção 2: Criar MPT */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
            2️⃣ Criar MPT
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome do Token:
              </label>
              <input
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600"
                placeholder="Ex: LAND-TEST-001"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supply Máximo:
                </label>
                <input
                  type="text"
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Ex: 100000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Decimais (0-9):
                </label>
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={decimals}
                  onChange={(e) => setDecimals(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>

            <button
              onClick={createMPT}
              disabled={loading || !walletId}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
            >
              {loading ? '⏳ Criando MPT...' : '🚀 Criar MPT'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
              <strong>Erro:</strong> {error}
            </div>
          )}

          {result && (
            <div className="mt-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
              <h3 className="font-semibold text-green-800 dark:text-green-300 mb-3">
                ✅ MPT Criado com Sucesso!
              </h3>
              <div className="text-sm space-y-3 text-green-700 dark:text-green-400">
                {/* MPTokenIssuanceID */}
                <div>
                  <p className="font-medium mb-1">MPTokenIssuanceID:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-green-200 dark:bg-green-800 p-2 rounded text-xs break-all">
                      {result.mptokenIssuanceID}
                    </code>
                    <button
                      onClick={() => copyToClipboard(result.mptokenIssuanceID, 'mptId')}
                      className="p-2 hover:bg-green-200 dark:hover:bg-green-700 rounded transition-colors"
                      title="Copiar"
                    >
                      {copiedField === 'mptId' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a
                      href={getExplorerUrl(currentNetwork, 'mpt', result.mptokenIssuanceID)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-green-200 dark:hover:bg-green-700 rounded transition-colors"
                      title="Ver no Explorer"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                
                {/* TX Hash */}
                <div>
                  <p className="font-medium mb-1">TX Hash:</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={getExplorerUrl(currentNetwork, 'tx', result.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-green-200 dark:bg-green-800 p-2 rounded text-xs break-all hover:bg-green-300 dark:hover:bg-green-700 transition-colors underline decoration-dotted"
                    >
                      {result.txHash}
                    </a>
                    <button
                      onClick={() => copyToClipboard(result.txHash, 'txHash')}
                      className="p-2 hover:bg-green-200 dark:hover:bg-green-700 rounded transition-colors"
                      title="Copiar"
                    >
                      {copiedField === 'txHash' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a
                      href={getExplorerUrl(currentNetwork, 'tx', result.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-green-200 dark:hover:bg-green-700 rounded transition-colors"
                      title="Ver Transação no Explorer"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                
                {result.currency && (
                  <p><strong>Currency:</strong> {result.currency}</p>
                )}
                
                {/* Link direto para o explorer */}
                <div className="pt-2 border-t border-green-300 dark:border-green-600">
                  <a
                    href={getExplorerUrl(currentNetwork, 'tx', result.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-green-700 dark:text-green-300 hover:underline font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver transação no XRPL Explorer ({currentNetwork})
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Seção 3: Listar MPTs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
            3️⃣ MPTs Emitidos pela Carteira
          </h2>

          <button
            onClick={loadMPTs}
            disabled={loadingMpts || !walletId}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 mb-4"
          >
            {loadingMpts ? 'Carregando...' : '🔄 Carregar MPTs'}
          </button>

          {mpts.length > 0 ? (
            <div className="space-y-3">
              {mpts.map((mpt, index) => (
                <div
                  key={mpt.issuanceIdHex || index}
                  className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 dark:text-white">
                        {mpt.metadata?.name || mpt.metadata?.n || 'Token sem nome'}
                      </h4>
                      <a
                        href={getExplorerUrl(currentNetwork, 'mpt', mpt.issuanceIdHex)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-flex items-center gap-1"
                      >
                        ID: {mpt.issuanceIdHex?.slice(0, 20)}...
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                          Scale: {mpt.assetScale}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded text-xs">
                          Max: {mpt.maximumAmount}
                        </span>
                        {mpt.flags?.canTransfer && (
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs">
                            Transferível
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => copyToClipboard(mpt.issuanceIdHex, `mpt-${index}`)}
                        className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center gap-1"
                      >
                        {copiedField === `mpt-${index}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        Copiar ID
                      </button>
                      <a
                        href={getExplorerUrl(currentNetwork, 'mpt', mpt.issuanceIdHex)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 justify-center"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Explorer
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              {walletId ? 'Nenhum MPT encontrado para esta carteira.' : 'Selecione uma carteira primeiro.'}
            </p>
          )}
        </div>

        {/* Link para admin */}
        <div className="mt-6 text-center">
          <a href="/admin/wallets" className="text-blue-600 dark:text-blue-400 hover:underline mr-4">
            📁 Gerenciar Carteiras
          </a>
          <a href="/admin/mpt" className="text-blue-600 dark:text-blue-400 hover:underline">
            🎯 Admin MPT Completo
          </a>
        </div>
      </div>
    </div>
  );
}

