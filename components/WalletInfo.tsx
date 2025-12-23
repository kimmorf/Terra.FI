'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Wallet, 
  RefreshCw, 
  Coins, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ExternalLink,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';

interface WalletInfoProps {
  address: string;
  network: 'testnet' | 'devnet' | 'mainnet';
  label?: string;
  showHistory?: boolean;
  compact?: boolean;
}

interface TokenBalance {
  currency: string;
  balance: string;
  issuer?: string;
  issuanceId?: string;
}

interface Transaction {
  hash: string;
  type: string;
  amount?: string;
  currency?: string;
  destination?: string;
  source?: string;
  timestamp?: string;
  result: string;
}

const EXPLORER_URLS: Record<string, string> = {
  mainnet: 'https://livenet.xrpl.org',
  testnet: 'https://testnet.xrpl.org',
  devnet: 'https://devnet.xrpl.org',
};

function getExplorerUrl(network: string, type: 'tx' | 'account' | 'mpt', value: string): string {
  const baseUrl = EXPLORER_URLS[network] || EXPLORER_URLS.testnet;
  if (type === 'tx') return `${baseUrl}/transactions/${value}`;
  if (type === 'account') return `${baseUrl}/accounts/${value}`;
  // MPTs: O XRPL Explorer ainda não tem página dedicada para MPTs
  // Usamos a página da conta emissora como fallback
  if (type === 'mpt') return `${baseUrl}/accounts/${value}`;
  return baseUrl;
}

function shortenHash(hash: string, chars = 8): string {
  if (!hash) return '';
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

function formatAmount(amount: string | number, decimals = 6): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  return num.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: decimals 
  });
}

export function WalletInfo({ 
  address, 
  network, 
  label,
  showHistory = true,
  compact = false 
}: WalletInfoProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xrpBalance, setXrpBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [issuedMPTs, setIssuedMPTs] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expanded, setExpanded] = useState(!compact);
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadWalletData = useCallback(async () => {
    if (!address || !address.startsWith('r')) return;

    setLoading(true);
    setError(null);

    try {
      // Buscar saldo XRP
      const xrpRes = await fetch(`/api/wallet/balance?address=${address}&network=${network}`);
      if (xrpRes.ok) {
        const xrpData = await xrpRes.json();
        setXrpBalance(xrpData.xrpBalance ?? null);
        setTokens(xrpData.tokens ?? []);
        setIssuedMPTs(xrpData.issuedMPTs ?? []);
      }

      // Buscar transações se showHistory
      if (showHistory) {
        const txRes = await fetch(`/api/wallet/transactions?address=${address}&network=${network}&limit=10`);
        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(txData.transactions ?? []);
        }
      }
    } catch (err: any) {
      console.error('[WalletInfo] Erro:', err);
      setError(err.message || 'Erro ao carregar dados da carteira');
    } finally {
      setLoading(false);
    }
  }, [address, network, showHistory]);

  useEffect(() => {
    loadWalletData();
  }, [loadWalletData]);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  const getTransactionIcon = (tx: Transaction) => {
    if (tx.destination === address) {
      return <ArrowDownLeft className="w-4 h-4 text-green-500" />;
    }
    return <ArrowUpRight className="w-4 h-4 text-red-500" />;
  };

  const getTransactionLabel = (tx: Transaction) => {
    switch (tx.type) {
      case 'Payment':
        return tx.destination === address ? 'Recebido' : 'Enviado';
      case 'MPTokenIssuanceCreate':
        return 'Emissão MPT';
      case 'MPTokenAuthorize':
        return 'Autorização MPT';
      case 'TrustSet':
        return 'Trustline';
      case 'OfferCreate':
        return 'Oferta DEX';
      case 'OfferCancel':
        return 'Cancelamento Oferta';
      default:
        return tx.type;
    }
  };

  if (!address) return null;

  return (
    <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {label || 'Carteira'}
              </h3>
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full capitalize">
                {network}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {shortenHash(address, 10)}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyAddress();
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {xrpBalance !== null && (
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatAmount(xrpBalance, 2)} XRP
              </p>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadWalletData();
            }}
            disabled={loading}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Conteúdo Expandido */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Tokens */}
              <div className="p-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Coins className="w-4 h-4" /> Tokens
                </h4>
                
                {tokens.length === 0 && issuedMPTs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum token encontrado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Tokens recebidos/em posse */}
                    {tokens.map((token, idx) => (
                      <div
                        key={`token-${idx}`}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {token.currency}
                          </p>
                          {token.issuer && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              Issuer: {shortenHash(token.issuer)}
                            </p>
                          )}
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {formatAmount(token.balance)}
                        </p>
                      </div>
                    ))}
                    
                    {/* MPTs emitidos */}
                    {issuedMPTs.length > 0 && (
                      <div className="mt-4">
                        <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase">
                          MPTs Emitidos por esta carteira
                        </h5>
                        {issuedMPTs.map((mpt, idx) => (
                          <div
                            key={`mpt-${idx}`}
                            className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg mb-2"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-purple-900 dark:text-purple-200">
                                {mpt.ticker || mpt.currency || 'MPT'}
                              </p>
                              <p className="text-xs text-purple-600 dark:text-purple-400 font-mono">
                                {shortenHash(mpt.issuanceIdHex || mpt.MPTokenIssuanceID, 12)}
                              </p>
                            </div>
                            <a
                              href={getExplorerUrl(network, 'account', address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-lg transition"
                              title="Ver conta no Explorer"
                            >
                              <ExternalLink className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Histórico de Transações */}
              {showHistory && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                  <button
                    onClick={() => setShowTxHistory(!showTxHistory)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
                  >
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Histórico de Transações
                    </span>
                    {showTxHistory ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showTxHistory && (
                    <div className="mt-3 space-y-2">
                      {transactions.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Nenhuma transação encontrada
                        </p>
                      ) : (
                        transactions.map((tx, idx) => (
                          <div
                            key={`tx-${idx}`}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              {getTransactionIcon(tx)}
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white text-sm">
                                  {getTransactionLabel(tx)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                  {shortenHash(tx.hash)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {tx.amount && (
                                <span className={`text-sm font-medium ${
                                  tx.destination === address 
                                    ? 'text-green-600 dark:text-green-400' 
                                    : 'text-red-600 dark:text-red-400'
                                }`}>
                                  {tx.destination === address ? '+' : '-'}{formatAmount(tx.amount)} {tx.currency || 'XRP'}
                                </span>
                              )}
                              <a
                                href={getExplorerUrl(network, 'tx', tx.hash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                              >
                                <ExternalLink className="w-3 h-3 text-gray-400" />
                              </a>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Link para Explorer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <a
                  href={getExplorerUrl(network, 'account', address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver no Explorer
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

