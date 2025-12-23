'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    Wallet,
    Check,
    Copy,
    AlertCircle,
    Info,
    Sparkles,
    Shield,
    ArrowRight,
    UserPlus,
    SendHorizontal,
    Snowflake,
    Undo2,
    LockKeyhole,
    Building2,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { WalletSelector } from '@/components/WalletSelector';
import { WalletInfo } from '@/components/WalletInfo';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';
import {
    authorizeMPToken,
    freezeMPToken,
    clawbackMPToken,
    sendMPToken,
    extractTransactionHash,
} from '@/lib/crossmark/transactions';
import { TOKEN_PRESETS, TOKEN_CONFIG, type TokenPreset } from '@/lib/tokens/presets';
import { registerAction } from '@/lib/elysia-client';
import {
    getTokenHolders,
    hasTrustLine,
    getAccountBalance,
    getAccountLines,
    getAccountTransactions,
} from '@/lib/xrpl/mpt';

function formatAddress(address: string) {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

function sanitizeDecimal(value: string) {
    return value.replace(/,/g, '.').trim();
}

function convertToBaseUnits(value: string, decimals: number): string | null {
    const sanitized = sanitizeDecimal(value);
    if (!sanitized) return null;
    if (!/^\d+(\.\d+)?$/.test(sanitized)) return null;

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

function rippleTimeToDate(time?: number) {
    if (!time || typeof time !== 'number') return null;
    const unix = (time + 946684800) * 1000;
    return new Date(unix);
}

const explorerByNetwork: Record<string, string> = {
    mainnet: 'https://livenet.xrpl.org/transactions/',
    testnet: 'https://testnet.xrpl.org/transactions/',
    devnet: 'https://devnet.xrpl.org/transactions/',
};

function getExplorerUrl(network: string | undefined, hash: string | null) {
    if (!network || !hash) return null;
    const base = explorerByNetwork[network];
    if (!base) return null;
    return `${base}${hash}`;
}

export default function ManageTokensPage() {
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

    const [selectedTokenId, setSelectedTokenId] = useState<string>(TOKEN_PRESETS[0]?.id ?? 'LAND');
    const selectedPreset = useMemo<TokenPreset | undefined>(
        () => TOKEN_PRESETS.find((preset) => preset.id === selectedTokenId),
        [selectedTokenId],
    );
    const selectedConfig = TOKEN_CONFIG[selectedTokenId] ?? { decimals: 2, transferable: true };

    // MPTs emitidos (carregados do XRPL)
    const [issuedMPTs, setIssuedMPTs] = useState<any[]>([]);
    const [issuedMPTsLoading, setIssuedMPTsLoading] = useState(false);
    const [selectedMPT, setSelectedMPT] = useState<any | null>(null);

    const [copied, setCopied] = useState(false);

    // Authorize state
    const [holderAddress, setHolderAddress] = useState('');
    const [authorizeError, setAuthorizeError] = useState<string | null>(null);
    const [authorizeSuccess, setAuthorizeSuccess] = useState<string | null>(null);
    
    // Auto-autorização (para receber MPTs)
    const [selfAuthMptId, setSelfAuthMptId] = useState(''); // MPTokenIssuanceID para auto-autorização

    // Payment state
    const [destinationAddress, setDestinationAddress] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMemo, setPaymentMemo] = useState('');
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

    // Freeze state
    const [freezeHolder, setFreezeHolder] = useState('');
    const [freezeError, setFreezeError] = useState<string | null>(null);
    const [freezeSuccess, setFreezeSuccess] = useState<string | null>(null);

    // Clawback state
    const [clawbackHolder, setClawbackHolder] = useState('');
    const [clawbackAmount, setClawbackAmount] = useState('');
    const [clawbackError, setClawbackError] = useState<string | null>(null);
    const [clawbackSuccess, setClawbackSuccess] = useState<string | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const [holders, setHolders] = useState<any[]>([]);
    const [holdersLoading, setHoldersLoading] = useState(false);
    const [accountLines, setAccountLines] = useState<any[]>([]);
    const [accountLinesLoading, setAccountLinesLoading] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const formattedTransactions = useMemo(() => {
        if (!transactions || transactions.length === 0) return [];

        return transactions
            .map((entry: any) => {
                const tx = entry.tx ?? entry.tx_json ?? {};
                const type = tx.TransactionType;
                const hash = tx.hash ?? entry.hash;
                const date = rippleTimeToDate(tx.date);
                let direction: 'Sent' | 'Received' | 'Other' = 'Other';
                let amountDisplay = '';
                let counterparty = '';
                let token = '';

                if (type === 'Payment') {
                    const amt = tx.Amount;
                    if (typeof amt === 'object' && amt !== null) {
                        token = `${amt.currency}/${amt.issuer?.slice(0, 6)}…`;
                        amountDisplay = amt.value;
                    } else if (typeof amt === 'string') {
                        amountDisplay = (parseInt(amt, 10) / 1_000_000).toFixed(6);
                        token = 'XRP';
                    }
                    if (account?.address) {
                        if (tx.Account === account.address) {
                            direction = 'Sent';
                            counterparty = tx.Destination ?? '';
                        } else if (tx.Destination === account.address) {
                            direction = 'Received';
                            counterparty = tx.Account ?? '';
                        }
                    }
                } else if (type === 'MPTokenAuthorize' || type === 'MPTokenFreeze' || type === 'MPTokenClawback') {
                    token = tx.Currency ?? '';
                    counterparty = tx.Holder ?? '';
                    direction = tx.Account === account?.address ? 'Sent' : 'Received';
                    amountDisplay = tx.Amount ?? '';
                } else if (type === 'MPTokenIssuanceCreate') {
                    token = tx.Currency ?? '';
                    amountDisplay = tx.Amount ?? '';
                    direction = tx.Account === account?.address ? 'Sent' : 'Received';
                }

                return {
                    hash,
                    type,
                    direction,
                    amount: amountDisplay,
                    token,
                    counterparty,
                    date,
                };
            })
            .filter(Boolean);
    }, [transactions, account?.address]);

    useEffect(() => {
        if (!account) return;

        let cancelled = false;
        setHoldersLoading(true);
        getTokenHolders({
            issuer: account.address,
            currency: selectedPreset?.currency ?? selectedTokenId,
            network: account.network,
        })
            .then((data) => {
                if (!cancelled) setHolders(data);
            })
            .catch((error) => {
                console.warn('[MPT] Falha ao carregar holders', error);
                if (!cancelled) setHolders([]);
            })
            .finally(() => {
                if (!cancelled) setHoldersLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [account, selectedPreset, selectedTokenId]);

    useEffect(() => {
        if (!account) {
            setAccountLines([]);
            setTransactions([]);
            return;
        }

        let cancelled = false;

        setAccountLinesLoading(true);
        getAccountLines({ account: account.address, network: account.network })
            .then((lines) => {
                if (!cancelled) {
                    const filtered = (lines ?? []).filter((line: any) => line.currency !== 'XRP');
                    setAccountLines(filtered);
                }
            })
            .catch((error) => {
                console.warn('[MPT] Falha ao carregar trustlines do usuário', error);
                if (!cancelled) setAccountLines([]);
            })
            .finally(() => {
                if (!cancelled) setAccountLinesLoading(false);
            });

        setTransactionsLoading(true);
        getAccountTransactions({ account: account.address, network: account.network, limit: 25 })
            .then((txs) => {
                if (!cancelled) setTransactions(txs ?? []);
            })
            .catch((error) => {
                console.warn('[MPT] Falha ao carregar transações do usuário', error);
                if (!cancelled) setTransactions([]);
            })
            .finally(() => {
                if (!cancelled) setTransactionsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [account]);

    // Carregar MPTs emitidos pelo account
    useEffect(() => {
        if (!account) {
            setIssuedMPTs([]);
            setSelectedMPT(null);
            return;
        }

        let cancelled = false;
        setIssuedMPTsLoading(true);

        fetch(`/api/mpt/list?issuer=${encodeURIComponent(account.address)}&network=${account.network}`)
            .then((res) => res.json())
            .then((data) => {
                if (!cancelled) {
                    setIssuedMPTs(data.tokens || []);
                    // Selecionar o primeiro MPT automaticamente se houver
                    if (data.tokens?.length > 0) {
                        setSelectedMPT((prev: any) => prev || data.tokens[0]);
                    }
                }
            })
            .catch((error) => {
                console.warn('[MPT] Falha ao carregar MPTs emitidos', error);
                if (!cancelled) setIssuedMPTs([]);
            })
            .finally(() => {
                if (!cancelled) setIssuedMPTsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [account]);

    const handleConnect = useCallback(async () => {
        try {
            const success = await connect();
            if (success) {
                refreshAccount();
            }
        } catch (error) {
            console.error('[TokenManage] erro ao conectar Crossmark', error);
        }
    }, [connect, refreshAccount]);

    const handleDisconnect = useCallback(() => {
        disconnect();
        setAuthorizeError(null);
        setAuthorizeSuccess(null);
        setPaymentError(null);
        setPaymentSuccess(null);
        setFreezeError(null);
        setFreezeSuccess(null);
        setClawbackError(null);
        setClawbackSuccess(null);
    }, [disconnect]);

    const copyIssuer = useCallback(() => {
        if (!account?.address || typeof navigator === 'undefined') return;

        navigator.clipboard
            .writeText(account.address)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch((error) => console.error('Erro ao copiar endereço:', error));
    }, [account?.address]);

    const handleAuthorize = useCallback(async (authorize: boolean) => {
        if (!account) {
            setAuthorizeError('Conecte sua Crossmark.');
            return;
        }

        if (!holderAddress.trim()) {
            setAuthorizeError('Informe o endereço a ser autorizado.');
            return;
        }

        // Precisamos do MPTokenIssuanceID (se tiver MPT selecionado) ou currency/issuer (legado)
        if (!selectedMPT && !selectedPreset) {
            setAuthorizeError('Selecione um token/MPT para autorizar.');
            return;
        }

        setIsSubmitting(true);
        setAuthorizeError(null);
        setAuthorizeSuccess(null);

        try {
            // Usar MPTokenIssuanceID se disponível (MPT nativo), senão usar currency/issuer (legado)
            const authParams = selectedMPT?.issuanceIdHex
                ? {
                    mptokenIssuanceID: selectedMPT.issuanceIdHex,
                    holder: holderAddress.trim(),
                    authorize,
                    account: account.address, // Account que está autorizando
                }
                : {
                    issuer: account.address,
                    currency: selectedPreset?.currency,
                    holder: holderAddress.trim(),
                    authorize,
                };

            const response = await authorizeMPToken(authParams);
            const hash = extractTransactionHash(response);

            await registerAction({
                type: 'authorize',
                token: selectedMPT?.issuanceIdHex 
                    ? { mptokenIssuanceID: selectedMPT.issuanceIdHex }
                    : { currency: selectedPreset?.currency || '', issuer: account.address },
                actor: account.address,
                target: holderAddress.trim(),
                network: account.network,
                txHash: hash ?? 'unknown',
                metadata: { authorize },
            });

            setAuthorizeSuccess(
                authorize
                    ? 'Destinatário autorizado com sucesso.'
                    : 'Destinatário removido da lista de autorizações.',
            );
        } catch (error) {
            console.error('Erro ao autorizar:', error);
            const message = error instanceof Error ? error.message : 'Falha ao autorizar destinatário.';
            setAuthorizeError(message);
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedPreset, selectedMPT, holderAddress]);
    
    // Auto-autorização: a conta Crossmark autoriza a si mesma a receber um MPT
    const handleSelfAuthorize = useCallback(async () => {
        if (!account) {
            setAuthorizeError('Conecte sua Crossmark.');
            return;
        }

        if (!selfAuthMptId.trim()) {
            setAuthorizeError('Informe o MPTokenIssuanceID do token que deseja receber.');
            return;
        }

        // Validar formato do MPTokenIssuanceID (64 caracteres hex)
        const cleanedId = selfAuthMptId.trim().replace(/[^0-9A-Fa-f]/g, '');
        if (cleanedId.length !== 64) {
            setAuthorizeError('MPTokenIssuanceID inválido. Deve ter 64 caracteres hexadecimais.');
            return;
        }

        setIsSubmitting(true);
        setAuthorizeError(null);
        setAuthorizeSuccess(null);

        try {
            // A conta autoriza a si mesma
            const response = await authorizeMPToken({
                mptokenIssuanceID: cleanedId.toUpperCase(),
                holder: account.address, // Holder é a própria conta
                authorize: true,
                account: account.address, // Account que envia a transação
            });
            const hash = extractTransactionHash(response);

            await registerAction({
                type: 'authorize',
                token: { mptokenIssuanceID: cleanedId.toUpperCase() },
                actor: account.address,
                target: account.address,
                network: account.network,
                txHash: hash ?? 'unknown',
                metadata: { selfAuthorize: true },
            });

            setAuthorizeSuccess('Você autorizou sua conta a receber este MPT! Agora pode receber transferências.');
            setSelfAuthMptId('');
        } catch (error) {
            console.error('Erro ao auto-autorizar:', error);
            const message = error instanceof Error ? error.message : 'Falha ao autorizar.';
            setAuthorizeError(message);
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selfAuthMptId]);

    const handlePayment = useCallback(async () => {
        if (!account) {
            setPaymentError('Conecte sua Crossmark.');
            return;
        }

        // Verificar se tem MPT ou preset selecionado
        if (!selectedMPT && !selectedPreset) {
            setPaymentError('Selecione um token para enviar.');
            return;
        }

        if (!destinationAddress.trim()) {
            setPaymentError('Informe o endereço de destino.');
            return;
        }

        if (!paymentAmount.trim()) {
            setPaymentError('Informe o valor a ser enviado.');
            return;
        }

        const sanitizedAmount = sanitizeDecimal(paymentAmount);
        if (!/^\d+(\.\d+)?$/.test(sanitizedAmount)) {
            setPaymentError('Valor inválido. Utilize apenas números e ponto decimal.');
            return;
        }

        setIsSubmitting(true);
        setPaymentError(null);
        setPaymentSuccess(null);

        try {
            // Se tem MPT selecionado, usa o mptokenIssuanceID
            // Caso contrário, usa o formato currency/issuer do preset
            const paymentParams: any = {
                sender: account.address,
                destination: destinationAddress.trim(),
                amount: sanitizedAmount,
                memo: paymentMemo.trim() || undefined,
            };

            if (selectedMPT?.issuanceIdHex) {
                // Formato MPT moderno
                paymentParams.mptokenIssuanceID = selectedMPT.issuanceIdHex;
            } else if (selectedPreset) {
                // Formato IOU legado
                paymentParams.currency = selectedPreset.currency;
                paymentParams.issuer = account.address;
            } else {
                throw new Error('Nenhum token selecionado para envio');
            }

            const response = await sendMPToken(paymentParams);
            const hash = extractTransactionHash(response);

            await registerAction({
                type: 'payment',
                token: selectedMPT 
                    ? { currency: selectedMPT.metadata?.name || 'MPT', issuer: account.address }
                    : { currency: selectedPreset!.currency, issuer: account.address },
                actor: account.address,
                target: destinationAddress.trim(),
                amount: sanitizedAmount,
                network: account.network,
                txHash: hash ?? 'unknown',
                metadata: { 
                    memo: paymentMemo.trim(),
                    mptokenIssuanceID: selectedMPT?.issuanceIdHex || undefined,
                },
            });

            setPaymentSuccess('Pagamento enviado com sucesso.');
            refreshAccount();
        } catch (error) {
            console.error('Erro ao enviar token:', error);
            const message = error instanceof Error ? error.message : 'Falha ao enviar token.';
            setPaymentError(message);
        } finally {
            setIsSubmitting(false);
        }
    }, [
        account,
        selectedPreset,
        selectedMPT,
        paymentAmount,
        destinationAddress,
        paymentMemo,
        refreshAccount,
    ]);

    const handleFreeze = useCallback(async (freeze: boolean) => {
        if (!account || !selectedPreset) {
            setFreezeError('Conecte sua Crossmark e selecione um token.');
            return;
        }

        if (!freezeHolder.trim()) {
            setFreezeError('Informe o endereço a ser congelado/descongelado.');
            return;
        }

        setIsSubmitting(true);
        setFreezeError(null);
        setFreezeSuccess(null);

        try {
            const response = await freezeMPToken({
                issuer: account.address,
                currency: selectedPreset.currency,
                holder: freezeHolder.trim(),
                freeze,
            });
            const hash = extractTransactionHash(response);

            await registerAction({
                type: 'freeze',
                token: { currency: selectedPreset.currency, issuer: account.address },
                actor: account.address,
                target: freezeHolder.trim(),
                network: account.network,
                txHash: hash ?? 'unknown',
                metadata: { freeze },
            });

            setFreezeSuccess(freeze ? 'Conta congelada para este MPT.' : 'Conta descongelada.');
        } catch (error) {
            console.error('Erro ao congelar:', error);
            const message = error instanceof Error ? error.message : 'Falha ao executar freeze.';
            setFreezeError(message);
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedPreset, freezeHolder]);

    const handleClawback = useCallback(async () => {
        if (!account || !selectedPreset) {
            setClawbackError('Conecte sua Crossmark e selecione um token.');
            return;
        }

        if (!clawbackHolder.trim()) {
            setClawbackError('Informe o endereço alvo do clawback.');
            return;
        }

        const baseUnits = convertToBaseUnits(clawbackAmount, selectedConfig.decimals);
        if (!baseUnits) {
            setClawbackError(
                `Valor inválido. Utilize números positivos com até ${selectedConfig.decimals} casas decimais.`,
            );
            return;
        }

        setIsSubmitting(true);
        setClawbackError(null);
        setClawbackSuccess(null);

        try {
            const response = await clawbackMPToken({
                issuer: account.address,
                currency: selectedPreset.currency,
                holder: clawbackHolder.trim(),
                amount: baseUnits,
            });
            const hash = extractTransactionHash(response);

            await registerAction({
                type: 'clawback',
                token: { currency: selectedPreset.currency, issuer: account.address },
                actor: account.address,
                target: clawbackHolder.trim(),
                amount: clawbackAmount,
                network: account.network,
                txHash: hash ?? 'unknown',
                metadata: { baseUnits },
            });

            setClawbackSuccess('Clawback executado com sucesso.');
            refreshAccount();
        } catch (error) {
            console.error('Erro no clawback:', error);
            const message = error instanceof Error ? error.message : 'Falha ao executar clawback.';
            setClawbackError(message);
        } finally {
            setIsSubmitting(false);
        }
    }, [
        account,
        selectedPreset,
        clawbackHolder,
        clawbackAmount,
        selectedConfig.decimals,
        refreshAccount,
    ]);

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
                        <Shield className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                            Terra.FI Token Control
                        </h1>
                    </div>
                    <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300">
                        Autorize investidores, transfira MPTs, congele ou execute clawback de tokens conforme a
                        governança definida em <Link href="/Terra_fi.md" className="underline">Terra_fi.md</Link>.
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link
                            href="/tokens/create"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                            <Sparkles className="w-5 h-5" /> Emitir novos tokens
                        </Link>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold shadow hover:shadow-md transition-all duration-300"
                        >
                            <Building2 className="w-5 h-5" /> Voltar ao dashboard
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
                                Conecte a carteira emissora dos MPTs para executar as operações.
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
                                        onClick={copyIssuer}
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
                                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-3 disabled:opacity-50"
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
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <Sparkles className="w-5 h-5" /> Tokens disponíveis
                                </h3>
                                <div className="space-y-3 mt-4">
                                    {TOKEN_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => setSelectedTokenId(preset.id)}
                                            className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${preset.id === selectedTokenId
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-lg'
                                                : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 hover:border-blue-300 dark:hover:border-blue-600'
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`p-3 rounded-xl ${preset.id === selectedTokenId
                                                    ? 'bg-gradient-to-br from-blue-500 to-purple-500 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                    }`}>
                                                    <Shield className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-lg font-semibold">{preset.label}</h4>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">{preset.summary}</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6">
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">Holders</h3>
                                {holdersLoading ? (
                                    <div className="text-sm text-gray-500 dark:text-gray-400">Carregando...</div>
                                ) : holders.length === 0 ? (
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                        Nenhum holder encontrado para este token.
                                    </div>
                                ) : (
                                    <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                        {holders.map((holder) => (
                                            <li key={`${holder.account}-${holder.currency}`} className="flex flex-col">
                                                <span className="font-mono text-xs">{holder.account}</span>
                                                <span>
                                                    Balance:{' '}
                                                    <strong>
                                                        {holder.balance} {holder.currency}
                                                    </strong>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-3 space-y-8">
                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <UserPlus className="w-5 h-5" /> Autorizar destinatário
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Autorize ou revogue permissões para que um endereço receba {selectedPreset?.label}.
                                </p>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Endereço
                                    </label>
                                    <input
                                        value={holderAddress}
                                        onChange={(event) => setHolderAddress(event.target.value)}
                                        placeholder="r..."
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => handleAuthorize(true)}
                                        disabled={isSubmitting || !isConnected}
                                        className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                                    >
                                        Autorizar
                                    </button>
                                    <button
                                        onClick={() => handleAuthorize(false)}
                                        disabled={isSubmitting || !isConnected}
                                        className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                                    >
                                        Revogar
                                    </button>
                                </div>
                                {authorizeError && (
                                    <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                        <AlertCircle className="w-4 h-4 mt-0.5" /> {authorizeError}
                                    </div>
                                )}
                                {authorizeSuccess && (
                                    <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                        <Check className="w-4 h-4 mt-0.5" /> {authorizeSuccess}
                                    </div>
                                )}
                            </div>

                            {/* Auto-autorização para RECEBER MPTs */}
                            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-3xl shadow-lg p-6 space-y-4">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-purple-600" /> Autorizar-se a Receber MPT
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    <strong>Para receber MPTs</strong>, você precisa primeiro autorizar sua conta. 
                                    Cole o MPTokenIssuanceID do token que deseja receber abaixo.
                                </p>
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                                    <p className="text-xs text-yellow-700 dark:text-yellow-400">
                                        <strong>Dica:</strong> Peça ao emissor o MPTokenIssuanceID (64 caracteres hexadecimais). 
                                        Sem essa autorização, você não poderá receber o token.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        MPTokenIssuanceID
                                    </label>
                                    <input
                                        value={selfAuthMptId}
                                        onChange={(event) => setSelfAuthMptId(event.target.value)}
                                        placeholder="Ex: 6108E5C0D3651989..."
                                        className="w-full px-4 py-2 border border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                                    />
                                </div>
                                <button
                                    onClick={handleSelfAuthorize}
                                    disabled={isSubmitting || !isConnected || !selfAuthMptId.trim()}
                                    className="w-full px-5 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold shadow disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    <Shield className="w-5 h-5" />
                                    Autorizar Minha Conta a Receber
                                </button>
                            </div>

                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <SendHorizontal className="w-5 h-5" /> Enviar tokens
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {selectedMPT 
                                        ? `Enviando ${selectedMPT.metadata?.name || 'MPT'} (${selectedMPT.issuanceIdHex?.slice(0, 12)}...)`
                                        : `Realize pagamentos utilizando ${selectedPreset?.label}. Certifique-se de que o destino tem trustline ativa.`
                                    }
                                </p>

                                {/* Seletor de MPT emitido */}
                                {issuedMPTs.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Token para Enviar
                                        </label>
                                        <select
                                            value={selectedMPT?.issuanceIdHex || ''}
                                            onChange={(e) => {
                                                const mpt = issuedMPTs.find((m) => m.issuanceIdHex === e.target.value);
                                                setSelectedMPT(mpt || null);
                                            }}
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            <option value="">Selecione um MPT emitido...</option>
                                            {issuedMPTs.map((mpt) => (
                                                <option key={mpt.issuanceIdHex} value={mpt.issuanceIdHex}>
                                                    {mpt.metadata?.name || 'Token'} - {mpt.issuanceIdHex?.slice(0, 16)}...
                                                </option>
                                            ))}
                                        </select>
                                        {issuedMPTsLoading && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Carregando MPTs...</p>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Destino
                                        </label>
                                        <input
                                            value={destinationAddress}
                                            onChange={(event) => setDestinationAddress(event.target.value)}
                                            placeholder="r..."
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Valor ({selectedMPT?.metadata?.name || selectedPreset?.currency || 'tokens'})
                                        </label>
                                        <input
                                            value={paymentAmount}
                                            onChange={(event) => setPaymentAmount(event.target.value)}
                                            placeholder="1000"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Memo (opcional)
                                    </label>
                                    <input
                                        value={paymentMemo}
                                        onChange={(event) => setPaymentMemo(event.target.value)}
                                        placeholder="Descrição da transferência"
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <button
                                    onClick={handlePayment}
                                    disabled={isSubmitting || !isConnected}
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                                >
                                    Enviar
                                </button>
                                {paymentError && (
                                    <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                        <AlertCircle className="w-4 h-4 mt-0.5" /> {paymentError}
                                    </div>
                                )}
                                {paymentSuccess && (
                                    <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                        <Check className="w-4 h-4 mt-0.5" /> {paymentSuccess}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <Snowflake className="w-5 h-5" /> Freeze / Unfreeze
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Congele os tokens de um holder para transformá-los em colateral ou descongele quando apropriado.
                                </p>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Endereço
                                    </label>
                                    <input
                                        value={freezeHolder}
                                        onChange={(event) => setFreezeHolder(event.target.value)}
                                        placeholder="r..."
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => handleFreeze(true)}
                                        disabled={isSubmitting || !isConnected}
                                        className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                                    >
                                        Freeze
                                    </button>
                                    <button
                                        onClick={() => handleFreeze(false)}
                                        disabled={isSubmitting || !isConnected}
                                        className="px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                                    >
                                        Unfreeze
                                    </button>
                                </div>
                                {freezeError && (
                                    <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                        <AlertCircle className="w-4 h-4 mt-0.5" /> {freezeError}
                                    </div>
                                )}
                                {freezeSuccess && (
                                    <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                        <Check className="w-4 h-4 mt-0.5" /> {freezeSuccess}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <LockKeyhole className="w-5 h-5" /> Clawback
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Recupere tokens em caso de fraude, default ou encerramento de contrato.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Holder
                                        </label>
                                        <input
                                            value={clawbackHolder}
                                            onChange={(event) => setClawbackHolder(event.target.value)}
                                            placeholder="r..."
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Quantidade ({selectedPreset?.currency})
                                        </label>
                                        <input
                                            value={clawbackAmount}
                                            onChange={(event) => setClawbackAmount(event.target.value)}
                                            placeholder="100"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleClawback}
                                    disabled={isSubmitting || !isConnected}
                                    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                                >
                                    Executar Clawback
                                </button>
                                {clawbackError && (
                                    <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                        <AlertCircle className="w-4 h-4 mt-0.5" /> {clawbackError}
                                    </div>
                                )}
                                {clawbackSuccess && (
                                    <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                        <Check className="w-4 h-4 mt-0.5" /> {clawbackSuccess}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="max-w-6xl mx-auto mt-10"
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                                    Meu portfólio XRPL
                                </h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Atualiza com a carteira conectada
                                </span>
                            </div>
                            {accountLinesLoading ? (
                                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    Carregando trustlines...
                                </div>
                            ) : accountLines.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Nenhum MPT encontrado para esta carteira. Configure trustlines ou receba tokens.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                                            <tr>
                                                <th className="py-2">Token</th>
                                                <th className="py-2">Issuer</th>
                                                <th className="py-2 text-right">Balance</th>
                                                <th className="py-2 text-right">Limit</th>
                                                <th className="py-2 text-center">Freeze</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-700 dark:text-gray-200">
                                            {accountLines.map((line) => (
                                                <tr key={`${line.account}-${line.currency}`}>
                                                    <td className="py-2 font-semibold">
                                                        {line.currency}
                                                    </td>
                                                    <td className="py-2 text-xs font-mono">
                                                        {formatAddress(line.account)}
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        {line.balance}
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        {line.limit ?? '—'}
                                                    </td>
                                                    <td className="py-2 text-center">
                                                        {line.freeze ? (
                                                            <span className="px-2 py-0.5 text-xs bg-orange-200 text-orange-700 rounded-full">
                                                                Freeze
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 text-xs bg-green-200 text-green-700 rounded-full">
                                                                Live
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                                    Histórico recente
                                </h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Últimas {formattedTransactions.length} transações
                                </span>
                            </div>
                            {transactionsLoading ? (
                                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    Carregando histórico...
                                </div>
                            ) : formattedTransactions.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Sem transações recentes registradas para este endereço.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {formattedTransactions.map((tx) => {
                                        const url = getExplorerUrl(account?.network, tx.hash ?? null);
                                        return (
                                            <div
                                                key={tx.hash || Math.random()}
                                                className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">
                                                            {tx.type} • {tx.direction}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            {tx.date ? tx.date.toLocaleString('pt-BR') : 'Data desconhecida'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">
                                                            {tx.amount || '—'} {tx.token}
                                                        </p>
                                                        {tx.counterparty && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                {formatAddress(tx.counterparty)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                {url && (
                                                    <Link
                                                        href={url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 underline"
                                                    >
                                                        Ver no explorer <ArrowRight className="w-3 h-3" />
                                                    </Link>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.section>
            </div>
        </main>
    );
}
