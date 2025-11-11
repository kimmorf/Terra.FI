'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    Wallet,
    ArrowRight,
    Sparkles,
    DollarSign,
    Check,
    Copy,
    AlertCircle,
    Info,
    Coins,
    Building2,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';
import { trustSetToken, sendMPToken, authorizeMPToken, extractTransactionHash } from '@/lib/crossmark/transactions';
import { registerAction } from '@/lib/elysia-client';
import { STABLECOINS, findStablecoin } from '@/lib/tokens/stablecoins';
import { TOKEN_PRESETS, type TokenPreset } from '@/lib/tokens/presets';
import { hasTrustLine, getAccountBalance } from '@/lib/xrpl/mpt';

function formatAddress(address: string) {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export default function TradeTokensPage() {
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

    const [copied, setCopied] = useState(false);
    const [selectedStableId, setSelectedStableId] = useState(STABLECOINS[0]?.id ?? 'RLUSD_TEST');
    const selectedStable = useMemo(() => findStablecoin(selectedStableId), [selectedStableId]);

    const [trustlineStatus, setTrustlineStatus] = useState<'unknown' | 'ok' | 'missing'>('unknown');
    const [balance, setBalance] = useState<string>('0');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [purchaseAmount, setPurchaseAmount] = useState('100');
    const [purchaseProject, setPurchaseProject] = useState<TokenPreset['id']>(
        TOKEN_PRESETS[0]?.id ?? 'LAND',
    );
    const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
    const [purchaseError, setPurchaseError] = useState<string | null>(null);

    const [sellAmount, setSellAmount] = useState('50');
    const [sellMessage, setSellMessage] = useState<string | null>(null);
    const [sellError, setSellError] = useState<string | null>(null);

    const [authorized, setAuthorized] = useState(false);
    const [issuerAddress, setIssuerAddress] = useState<string>(
        TOKEN_PRESETS.find((token) => token.id === purchaseProject)?.issuerAddress ?? '',
    );

    const extractHash = (response: any) =>
        response?.hash ??
        response?.result?.hash ??
        response?.result?.tx_json?.hash ??
        response?.tx_json?.hash ??
        response?.response?.hash ??
        response?.response?.result?.hash ??
        null;

    useEffect(() => {
        let cancelled = false;
        async function loadStatus() {
            if (!account || !selectedStable) {
                setTrustlineStatus('unknown');
                setBalance('0');
                return;
            }
            try {
                const hasLine = await hasTrustLine({
                    account: account.address,
                    currency: selectedStable.currency,
                    issuer: selectedStable.issuer,
                    network: account.network,
                });
                if (!cancelled) {
                    setTrustlineStatus(hasLine ? 'ok' : 'missing');
                }

                const bal = await getAccountBalance({
                    account: account.address,
                    currency: selectedStable.currency,
                    issuer: selectedStable.issuer,
                    network: account.network,
                });
                if (!cancelled) {
                    setBalance(bal);
                }
            } catch (error) {
                console.warn('[Trade] Falha ao verificar trustline/balance', error);
                if (!cancelled) {
                    setTrustlineStatus('unknown');
                    setBalance('0');
                }
            }
        }

        loadStatus();
        return () => {
            cancelled = true;
        };
    }, [account, selectedStable]);

    useEffect(() => {
        if (!account) {
            setAuthorized(false);
            return;
        }
        setAuthorized(false);
    }, [account, purchaseProject]);

    useEffect(() => {
        const preset = TOKEN_PRESETS.find((token) => token.id === purchaseProject);
        setIssuerAddress(preset?.issuerAddress ?? '');
    }, [purchaseProject]);

    const handleConnect = useCallback(async () => {
        try {
            const success = await connect();
            if (success) refreshAccount();
        } catch (error) {
            console.error('[Trade] erro ao conectar Crossmark', error);
        }
    }, [connect, refreshAccount]);

    const handleDisconnect = useCallback(() => {
        disconnect();
        setPurchaseMessage(null);
        setPurchaseError(null);
        setSellMessage(null);
        setSellError(null);
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

    const handleCreateTrustline = useCallback(async () => {
        if (!account || !selectedStable) return;
        setIsSubmitting(true);
        try {
            const response = await trustSetToken({
                account: account.address,
                currency: selectedStable.currency,
                issuer: selectedStable.issuer,
                limit: '1000000',
            });
            const hash = extractTransactionHash(response);
            setTrustlineStatus('ok');
            setPurchaseMessage('Trustline criada com sucesso.');
            setPurchaseError(null);
            await registerAction({
                type: 'authorize',
                token: { currency: selectedStable.currency, issuer: selectedStable.issuer },
                actor: account.address,
                network: account.network,
                txHash: hash ?? 'trustline',
                metadata: { action: 'trustset' },
            });
        } catch (error) {
            console.error('Erro ao criar trustline:', error);
            setPurchaseError(error instanceof Error ? error.message : 'Falha ao criar trustline');
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedStable]);

    const handleAuthorizeInvestor = useCallback(async () => {
        if (!account || !selectedStable) return;
        const project = TOKEN_PRESETS.find((token) => token.id === purchaseProject);
        if (!project) return;

        setIsSubmitting(true);
        try {
            const response = await authorizeMPToken({
                issuer: issuerAddress || account.address,
                currency: project.currency,
                holder: account.address,
                authorize: true,
            });
            const hash = extractTransactionHash(response);
            setAuthorized(true);
            setPurchaseMessage('Autorização solicitada. Confirme na Crossmark.');
            setPurchaseError(null);
            await registerAction({
                type: 'authorize',
                token: { currency: project.currency, issuer: issuerAddress || account.address },
                actor: account.address,
                network: account.network,
                txHash: hash ?? 'authorize',
                metadata: { project: project.id, holder: account.address },
            });
        } catch (error) {
            console.error('Erro ao autorizar investidor:', error);
            setPurchaseError(error instanceof Error ? error.message : 'Falha ao autorizar investidor');
        } finally {
            setIsSubmitting(false);
        }
    }, [account, purchaseProject, selectedStable, issuerAddress]);

    const handlePurchase = useCallback(async () => {
        if (!account || !selectedStable) return;
        const project = TOKEN_PRESETS.find((token) => token.id === purchaseProject);
        if (!project) {
            setPurchaseError('Selecione um token válido.');
            return;
        }

        if (trustlineStatus !== 'ok') {
            setPurchaseError('Crie a trustline para o stablecoin antes de comprar.');
            return;
        }

        setIsSubmitting(true);
        setPurchaseError(null);
        setPurchaseMessage(null);

        try {
            const response = await sendMPToken({
                sender: account.address,
                destination: issuerAddress || account.address,
                amount: purchaseAmount,
                currency: selectedStable.currency,
                issuer: selectedStable.issuer,
                memo: `Compra ${project.label}`,
            });
            const hash = extractTransactionHash(response);

            await registerAction({
                type: 'payment',
                token: { currency: selectedStable.currency, issuer: selectedStable.issuer },
                actor: account.address,
                target: issuerAddress || account.address,
                amount: purchaseAmount,
                network: account.network,
                txHash: hash ?? 'payment',
                metadata: { project: project.id },
            });

            setPurchaseMessage('Pagamento enviado. Aguarde o recebimento do token pelo emissor.');
            refreshAccount();
        } catch (error) {
            console.error('Erro ao comprar token:', error);
            setPurchaseError(error instanceof Error ? error.message : 'Falha ao executar pagamento.');
        } finally {
            setIsSubmitting(false);
        }
    }, [
        account,
        selectedStable,
        purchaseProject,
        purchaseAmount,
        trustlineStatus,
        refreshAccount,
        issuerAddress,
    ]);

    const handleSell = useCallback(async () => {
        if (!account || !selectedStable) return;
        const project = TOKEN_PRESETS.find((token) => token.id === purchaseProject);
        if (!project) {
            setSellError('Selecione um token válido.');
            return;
        }

        setIsSubmitting(true);
        setSellError(null);
        setSellMessage(null);

        try {
            const response = await sendMPToken({
                sender: account.address,
                destination: issuerAddress || selectedStable.issuer,
                amount: sellAmount,
                currency: project.currency,
                issuer: issuerAddress || account.address,
                memo: 'Venda MPT',
            });
            const hash = extractTransactionHash(response);

            await registerAction({
                type: 'payment',
                token: { currency: project.currency, issuer: issuerAddress || account.address },
                actor: account.address,
                target: issuerAddress || selectedStable.issuer,
                amount: sellAmount,
                network: account.network,
                txHash: hash ?? 'sell',
                metadata: { project: project.id, action: 'sell' },
            });

            setSellMessage('Token enviado ao emissor. Liquidação será processada manualmente.');
            refreshAccount();
        } catch (error) {
            console.error('Erro ao vender token:', error);
            setSellError(error instanceof Error ? error.message : 'Falha ao executar venda.');
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedStable, purchaseProject, sellAmount, refreshAccount, issuerAddress]);

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300 relative overflow-hidden">
            <BackgroundParticles />
            <ThemeToggle />

            <div className="container mx-auto px-4 py-8 md:py-12">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="max-w-4xl mx-auto text-center mb-12"
                >
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <Coins className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                            Terra.FI Trading Desk
                        </h1>
                    </div>
                    <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300">
                        Compre e venda tokens Terra.FI utilizando stablecoins na XRPL Testnet. Configure trustlines e
                        execute pagamentos diretamente pela Crossmark.
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link
                            href="/tokens/create"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                            <Sparkles className="w-5 h-5" /> Emitir novos tokens
                        </Link>
                        <Link
                            href="/tokens/manage"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold shadow hover:shadow-md transition-all duration-300"
                        >
                            <Building2 className="w-5 h-5" /> Gestão de tokens
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
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                                Status da Crossmark
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                Conecte sua carteira para gerenciar trustlines e realizar pagamentos.
                            </p>
                        </div>
                        {isConnected && account ? (
                            <div className="flex flex-col md:items-end gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                                                Conectado
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleDisconnect}
                                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-300"
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
                                <a
                                    href="https://www.crossmark.io/download"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline"
                                >
                                    crossmark.io/download
                                </a>
                                {' '}e tente novamente.
                            </p>
                        </div>
                    )}

                    {crossmarkError && (
                        <div className="mt-4 flex items-start gap-3 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300">
                            <AlertCircle className="w-5 h-5 mt-1" />
                            <p className="text-sm">{crossmarkError}</p>
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
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">1. Stablecoin</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Selecione a stablecoin de compra. Uma trustline será criada automaticamente na XRPL Testnet.
                            </p>
                            <select
                                value={selectedStableId}
                                onChange={(event) => setSelectedStableId(event.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            >
                                {STABLECOINS.map((coin) => (
                                    <option key={coin.id} value={coin.id}>
                                        {coin.label}
                                    </option>
                                ))}
                            </select>
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                                Trustline: {' '}
                                {trustlineStatus === 'ok' ? (
                                    <span className="text-green-600 dark:text-green-400">Configurada</span>
                                ) : trustlineStatus === 'missing' ? (
                                    <span className="text-red-600 dark:text-red-400">Ausente</span>
                                ) : (
                                    <span className="text-gray-500 dark:text-gray-400">Desconhecida</span>
                                )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                                Saldo estimado: {balance} {selectedStable?.currency}
                            </div>
                            <button
                                onClick={handleCreateTrustline}
                                disabled={trustlineStatus === 'ok' || isSubmitting || !isConnected}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow disabled:opacity-50"
                            >
                                Criar trustline
                            </button>
                        </div>

                        <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">2. Selecionar token</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Escolha o token Terra.FI que deseja comprar/vender.
                            </p>
                            <select
                                value={purchaseProject}
                                onChange={(event) => setPurchaseProject(event.target.value as TokenPreset['id'])}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            >
                                {TOKEN_PRESETS.map((preset) => (
                                    <option key={preset.id} value={preset.id}>
                                        {preset.label}
                                    </option>
                                ))}
                            </select>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    Endereço do emissor
                                </label>
                                <input
                                    value={issuerAddress}
                                    onChange={(event) => setIssuerAddress(event.target.value)}
                                    placeholder="r..."
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Use o endereço que administra o token. Padrão de teste: {TOKEN_PRESETS.find((p) => p.id === purchaseProject)?.issuerAddress}
                                </p>
                            </div>
                            <button
                                onClick={handleAuthorizeInvestor}
                                disabled={authorized || isSubmitting || !isConnected}
                                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow disabled:opacity-50"
                            >
                                {authorized ? 'Autorizado' : 'Solicitar autorização'}
                            </button>
                        </div>
                    </div>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="max-w-6xl mx-auto mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6"
                >
                    <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                            <DollarSign className="w-5 h-5" /> Comprar tokens
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Envie {selectedStable?.currency} para o emissor e receba o token Terra.FI correspondente.
                        </p>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Quantidade ({selectedStable?.currency})
                            </label>
                            <input
                                value={purchaseAmount}
                                onChange={(event) => setPurchaseAmount(event.target.value)}
                                placeholder="100"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <button
                            onClick={handlePurchase}
                            disabled={isSubmitting || !isConnected}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                        >
                            Enviar pagamento
                        </button>
                        {purchaseMessage && (
                            <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                <Check className="w-4 h-4 mt-0.5" /> {purchaseMessage}
                            </div>
                        )}
                        {purchaseError && (
                            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                <AlertCircle className="w-4 h-4 mt-0.5" /> {purchaseError}
                            </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                            <DollarSign className="w-5 h-5" /> Vender tokens
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Envie MPTs de volta ao emissor para liquidação manual. Use para amortizações ou saída de posição.
                        </p>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Quantidade (MPT)
                            </label>
                            <input
                                value={sellAmount}
                                onChange={(event) => setSellAmount(event.target.value)}
                                placeholder="50"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <button
                            onClick={handleSell}
                            disabled={isSubmitting || !isConnected}
                            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                        >
                            Enviar token ao emissor
                        </button>
                        {sellMessage && (
                            <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                <Check className="w-4 h-4 mt-0.5" /> {sellMessage}
                            </div>
                        )}
                        {sellError && (
                            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                <AlertCircle className="w-4 h-4 mt-0.5" /> {sellError}
                            </div>
                        )}
                    </div>
                </motion.section>
            </div>
        </main>
    );
}
