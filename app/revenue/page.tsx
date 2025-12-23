'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet,
  DollarSign,
  Sparkles,
  Check,
  AlertCircle,
  Copy,
  Info,
  Building2,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { WalletSelector } from '@/components/WalletSelector';
import { WalletInfo } from '@/components/WalletInfo';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';
import { TOKEN_PRESETS, type TokenPreset } from '@/lib/tokens/presets';
import { STABLECOINS, type StablecoinConfig } from '@/lib/tokens/stablecoins';
import { getTokenHolders, calculateTotalSupply, hasTrustLine } from '@/lib/xrpl/mpt';
import { sendMPToken, extractTransactionHash } from '@/lib/crossmark/transactions';
import { registerAction } from '@/lib/elysia-client';
// Interface para MPTs emitidos do banco
interface IssuedMPT {
  id: string;
  ticker: string | null;
  currency: string | null;
  issuanceIdHex: string;
  issuerAddress: string;
  name?: string;
  maximumAmount?: string;
}

function formatAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export default function RevenuePage() {
  const {
    isConnected,
    isInstalled,
    isLoading: isWalletLoading,
    account,
    error: crossmarkError,
    connect,
    disconnect,
    refreshAccount,
  } = useCrossmarkContext();

  const [selectedTokenId, setSelectedTokenId] = useState<TokenPreset['id']>('REV');
  const [selectedStableId, setSelectedStableId] = useState(STABLECOINS[0]?.id ?? 'RLUSD_TEST');
  const selectedStable = useMemo<StablecoinConfig | undefined>(
    () => STABLECOINS.find((coin) => coin.id === selectedStableId),
    [selectedStableId],
  );

  // Estado para MPTs emitidos do banco
  const [issuedMPTs, setIssuedMPTs] = useState<IssuedMPT[]>([]);
  const [selectedMPTId, setSelectedMPTId] = useState<string>(''); // ID do MPT selecionado (vazio = usar preset)
  const selectedMPT = useMemo(() => issuedMPTs.find(mpt => mpt.id === selectedMPTId), [issuedMPTs, selectedMPTId]);

  const [holders, setHolders] = useState<any[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [totalRevenue, setTotalRevenue] = useState('1000');
  const [memo, setMemo] = useState('Distribuição de receitas Terra.FI');
  const [paymentStatus, setPaymentStatus] = useState<Record<string, { message?: string; error?: string }>>({});
  const [isPaying, setIsPaying] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Estado para saldo XRP e faucet
  const [xrpBalance, setXrpBalance] = useState<number | null>(null);
  const [requestingFaucet, setRequestingFaucet] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);

  // Carregar MPTs emitidos do banco
  useEffect(() => {
    async function loadIssuedMPTs() {
      try {
        const response = await fetch('/api/mpt/issuances');
        if (response.ok) {
          const data = await response.json();
          const mpts = data.issuances || [];
          setIssuedMPTs(mpts.map((m: any) => ({
            id: m.id,
            ticker: m.ticker,
            currency: m.currency,
            issuanceIdHex: m.issuanceIdHex,
            issuerAddress: m.issuerAddress,
            name: m.metadata?.name || m.ticker || 'MPT',
            maximumAmount: m.maximumAmount,
          })));
        }
      } catch (error) {
        console.warn('[Revenue] Erro ao carregar MPTs emitidos:', error);
      }
    }
    loadIssuedMPTs();
  }, []);

  // Carregar saldo XRP quando conta conectar
  useEffect(() => {
    async function loadXRPBalance() {
      if (!account?.address || !account?.network) {
        setXrpBalance(null);
        return;
      }
      try {
        const response = await fetch(`/api/wallet/balance?address=${account.address}&network=${account.network}`);
        if (response.ok) {
          const data = await response.json();
          setXrpBalance(data.xrpBalance ?? null);
        }
      } catch (error) {
        console.warn('[Revenue] Erro ao carregar saldo XRP:', error);
      }
    }
    loadXRPBalance();
  }, [account?.address, account?.network]);

  // Função para solicitar faucet
  const requestFaucet = useCallback(async () => {
    if (!account?.address || !account?.network) return;
    if (account.network === 'mainnet') {
      setFaucetMessage('Faucet não disponível na mainnet');
      return;
    }

    setRequestingFaucet(true);
    setFaucetMessage(null);

    const faucetUrls: Record<string, string> = {
      testnet: 'https://faucet.altnet.rippletest.net/accounts',
      devnet: 'https://faucet.devnet.rippletest.net/accounts',
    };

    const faucetUrl = faucetUrls[account.network];
    if (!faucetUrl) {
      setFaucetMessage('Rede não suportada para faucet');
      setRequestingFaucet(false);
      return;
    }

    try {
      const response = await fetch(faucetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: account.address,
          xrpAmount: '1000',
        }),
      });

      if (!response.ok) {
        throw new Error(`Faucet retornou ${response.status}`);
      }

      const data = await response.json();
      console.log('[Faucet] Sucesso:', data);
      setFaucetMessage('XRP creditado! Aguarde alguns segundos para atualizar.');
      
      // Recarrega saldo após 3 segundos
      setTimeout(async () => {
        try {
          const balanceResponse = await fetch(`/api/wallet/balance?address=${account.address}&network=${account.network}`);
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            setXrpBalance(balanceData.xrpBalance ?? null);
          }
        } catch (e) {
          console.warn('[Revenue] Erro ao recarregar saldo:', e);
        }
      }, 3000);
    } catch (error: any) {
      console.error('[Faucet] Erro:', error);
      setFaucetMessage(`Erro ao solicitar faucet: ${error.message}`);
    } finally {
      setRequestingFaucet(false);
    }
  }, [account?.address, account?.network]);

  useEffect(() => {
    if (!account) {
      setHolders([]);
      return;
    }

    let cancelled = false;
    const currentAccount = account; // Captura o valor para garantir que não seja null
    async function loadHolders() {
      if (!currentAccount) {
        setHolders([]);
        return;
      }

      try {
        setHoldersLoading(true);
        setLoadError(null);
        const preset = TOKEN_PRESETS.find((token) => token.id === selectedTokenId);
        if (!preset) {
          setHolders([]);
          return;
        }

        const lines = await getTokenHolders({
          issuer: currentAccount.address,
          currency: preset.currency,
          network: currentAccount.network,
        });

        if (!cancelled) {
          setHolders(lines ?? []);
        }
      } catch (error) {
        console.error('[Revenue] Falha ao carregar holders', error);
        if (!cancelled) {
          setLoadError('Não foi possível carregar a lista de holders.');
          setHolders([]);
        }
      } finally {
        if (!cancelled) setHoldersLoading(false);
      }
    }

    loadHolders();
    return () => {
      cancelled = true;
    };
  }, [account, selectedTokenId]);

  const totalSupply = useMemo(() => calculateTotalSupply(holders), [holders]);
  const parsedRevenue = useMemo(() => Number(totalRevenue || 0), [totalRevenue]);

  const distribution = useMemo(() => {
    if (!holders || !Array.isArray(holders) || totalSupply <= 0 || parsedRevenue <= 0) return [];

    return holders.map((holder: any) => {
      const balance = Number(holder.balance ?? 0);
      const share = (balance / totalSupply) * parsedRevenue;
      return {
        address: holder.account,
        balance,
        share,
      };
    });
  }, [holders, totalSupply, parsedRevenue]);

  const handleConnect = useCallback(async () => {
    try {
      const success = await connect();
      if (success) refreshAccount();
    } catch (error) {
      console.error('[Revenue] erro ao conectar Crossmark', error);
    }
  }, [connect, refreshAccount]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setPaymentStatus({});
  }, [disconnect]);

  const copyAddress = useCallback(() => {
    if (!account?.address || typeof navigator === 'undefined') return;

    navigator.clipboard
      .writeText(account.address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((error) => console.error('Erro ao copiar endereço:', error));
  }, [account?.address]);

  const handlePayHolder = useCallback(
    async (holderAddress: string, amount: number) => {
      const mpt = selectedMPT;
      
      if (!account || !selectedStable || amount <= 0) return;

      setIsPaying(true);
      setPaymentStatus((prev) => ({
        ...prev,
        [holderAddress]: { message: undefined, error: undefined },
      }));

      try {
        // Verificar trustline para stablecoin (se pagando com stablecoin)
        // Se pagando com MPT, a verificação de autorização é diferente
        if (!mpt) {
          const hasLine = await hasTrustLine({
            account: holderAddress,
            currency: selectedStable.currency,
            issuer: selectedStable.issuer,
            network: account.network,
          }).catch(() => false);

          if (!hasLine) {
            const message = `Holder sem trustline configurada para ${selectedStable.currency}.`;
            setPaymentStatus((prev) => ({
              ...prev,
              [holderAddress]: { error: message },
            }));
            setIsPaying(false);
            return;
          }
        }

        // Construir parâmetros de pagamento
        // Se MPT selecionado, usar mptokenIssuanceID; senão, usar stablecoin
        const paymentParams = mpt
          ? {
              sender: account.address,
              destination: holderAddress,
              amount: amount.toFixed(2), // MPTs geralmente usam 2 casas decimais
              mptokenIssuanceID: mpt.issuanceIdHex, // Formato MPT moderno
              memo: memo.trim() || undefined,
            }
          : {
              sender: account.address,
              destination: holderAddress,
              amount: amount.toFixed(selectedStable.decimals),
              currency: selectedStable.currency,
              issuer: selectedStable.issuer,
              memo: memo.trim() || undefined,
            };

        const response = await sendMPToken(paymentParams);
        const hash = extractTransactionHash(response);

        await registerAction({
          type: 'payout',
          token: mpt
            ? { mptokenIssuanceID: mpt.issuanceIdHex }
            : { currency: selectedStable.currency, issuer: selectedStable.issuer },
          actor: account.address,
          target: holderAddress,
          amount: amount.toString(),
          network: account.network,
          txHash: hash ?? 'unknown',
          metadata: {
            memo,
            sourceToken: selectedTokenId,
            mptId: mpt?.id,
          },
        });

        setPaymentStatus((prev) => ({
          ...prev,
          [holderAddress]: {
            message: hash
              ? `Pagamento enviado (hash: ${hash.slice(0, 8)}...)`
              : 'Pagamento enviado. Aguarde confirmação.',
          },
        }));
      } catch (error) {
        console.error('Erro ao pagar holder:', error);
        const message = error instanceof Error ? error.message : 'Falha ao executar pagamento.';
        setPaymentStatus((prev) => ({
          ...prev,
          [holderAddress]: { error: message },
        }));
      } finally {
        setIsPaying(false);
      }
    },
    [account, selectedStable, selectedMPT, memo, selectedTokenId],
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300 relative overflow-hidden">
      <BackgroundParticles />
      
      {/* Header com Wallet e Theme Toggle */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <WalletSelector />
      <ThemeToggle />
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <DollarSign className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              Distribuição de Receitas
            </h1>
          </div>
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300">
            Calcule e efetue pagamentos de REV-MPT proporcionalmente aos holders. Cada pagamento é assinado via Crossmark e registrado no Elysia.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/tokens/manage"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duração-300"
            >
              <Sparkles className="w-5 h-5" /> Gestão de Tokens
            </Link>
            <Link
              href="/tokens/trade"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold shadow hover:shadow-md transition-all duração-300"
            >
              <Building2 className="w-5 h-5" /> Trading Desk
            </Link>
          </div>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-5xl mx-auto bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-xl p-6 md:p-8 mb-12 backdrop-blur"
        >
          <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Status da Crossmark</h2>
              <p className="text-gray-600 dark:text-gray-300">Conecte a carteira emissora para executar os pagamentos.</p>
            </div>
            {isConnected && account ? (
              <div className="flex flex-col md:items-end gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm font-semibold text-green-700 dark:text-green-400">Conectado</span>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all duração-300"
                  >
                    Desconectar
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                  <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                    {formatAddress(account.address)}
                  </span>
                  <button
                    onClick={copyAddress}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    aria-label="Copiar endereço"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isWalletLoading}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duração-300 flex items-center gap-3 disabled:opacity-50"
              >
                {isWalletLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <Wallet className="w-5 h-5" /> Conectar Crossmark
                  </>
                )}
              </button>
            )}
          </div>

          {!isInstalled && !isConnected && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl text-blue-700 dark:text-blue-300">
              <Info className="w-5 h-5 mt-1" />
              <p className="text-sm">
                Não detectamos a extensão Crossmark. Instale em{' '}
                <a href="https://www.crossmark.io/download" target="_blank" rel="noreferrer" className="underline">
                  crossmark.io/download
                </a>{' '}
                e tente novamente.
              </p>
            </div>
          )}

          {crossmarkError && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300">
              <AlertCircle className="w-5 h-5 mt-1" />
              <p className="text-sm">{crossmarkError}</p>
            </div>
          )}

          {/* Saldo XRP e Faucet */}
          {isConnected && account && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-yellow-600" />
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    Saldo XRP: {xrpBalance !== null ? `${xrpBalance.toFixed(2)} XRP` : 'Carregando...'}
                  </span>
                </div>
                {account.network !== 'mainnet' && (
                  <button
                    onClick={requestFaucet}
                    disabled={requestingFaucet}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-semibold text-sm shadow disabled:opacity-50 flex items-center gap-2"
                  >
                    {requestingFaucet ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Solicitando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Solicitar Faucet
                      </>
                    )}
                  </button>
                )}
              </div>
              {faucetMessage && (
                <p className={`text-sm mt-2 ${faucetMessage.includes('Erro') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  {faucetMessage}
                </p>
              )}
            </div>
          )}

          {/* Informações da Carteira Conectada */}
          {isConnected && account && (
            <div className="mt-6">
              <WalletInfo
                address={account.address}
                network={account.network as 'testnet' | 'devnet' | 'mainnet'}
                label="Crossmark"
                showHistory={true}
                compact={false}
              />
            </div>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-6xl mx-auto"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">1. Selecionar token REV</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Escolha qual token Terra.FI terá as receitas distribuídas.
              </p>
              <select
                value={selectedTokenId}
                onChange={(event) => setSelectedTokenId(event.target.value as TokenPreset['id'])}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {TOKEN_PRESETS.filter((preset) => preset.id === 'REV').map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Holders identificados: {holders.length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Supply total (REV): {totalSupply.toFixed(2)}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">2. Stablecoin de pagamento</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Utilize o stablecoin da tesouraria (ex.: RLUSD na testnet).
              </p>
              <select
                value={selectedStableId}
                onChange={(event) => setSelectedStableId(event.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {STABLECOINS.map((stable) => (
                  <option key={stable.id} value={stable.id}>
                    {stable.label}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Receita total ({selectedStable?.currency})
                </label>
                <input
                  value={totalRevenue}
                  onChange={(event) => setTotalRevenue(event.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Memo (opcional)</label>
                <input
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duração: 0.5, delay: 0.3 }}
          className="max-w-6xl mx-auto mt-10"
        >
          <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">3. Destinatários</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Cada pagamento precisa de uma assinatura Crossmark
              </span>
            </div>

            {holdersLoading ? (
              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Carregando holders...
              </div>
            ) : loadError ? (
              <div className="flex items-start gap-3 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5" /> {loadError}
              </div>
            ) : distribution.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhum holder encontrado ou receita total nula. Ajuste os valores e tente novamente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="py-2">Holder</th>
                      <th className="py-2 text-right">Balance (REV)</th>
                      <th className="py-2 text-right">Participação</th>
                      <th className="py-2 text-right">Pagamento ({selectedStable?.currency})</th>
                      <th className="py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700 dark:text-gray-200">
                    {distribution.map(({ address, balance, share }) => {
                      const status = paymentStatus[address] ?? {};
                      return (
                        <tr key={address}>
                          <td className="py-2">
                            <span className="font-mono text-xs">{address}</span>
                          </td>
                          <td className="py-2 text-right">{balance.toFixed(4)}</td>
                          <td className="py-2 text-right">
                            {totalSupply > 0 ? ((balance / totalSupply) * 100).toFixed(2) : '0'}%
                          </td>
                          <td className="py-2 text-right">{share.toFixed(selectedStable?.decimals ?? 2)}</td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => handlePayHolder(address, share)}
                              disabled={isPaying || !isConnected}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                            >
                              Pagar
                            </button>
                            {status.message && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1">{status.message}</p>
                            )}
                            {status.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{status.error}</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
