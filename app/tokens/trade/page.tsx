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
import { trustSetToken, trustSetTokenWithSeed, sendMPToken, authorizeMPToken, extractTransactionHash } from '@/lib/crossmark/transactions';
import { registerAction } from '@/lib/elysia-client';
import { STABLECOINS, findStablecoin } from '@/lib/tokens/stablecoins';
import { TOKEN_PRESETS, type TokenPreset } from '@/lib/tokens/presets';
import { hasTrustLine, getAccountBalance } from '@/lib/xrpl/mpt';
import { createOffer, cancelOffer, getAccountOffers, getBookOffers, formatOffer, type Offer, type BookOffer } from '@/lib/xrpl/dex';
import { xrpToDrops } from '@/lib/utils/xrp-converter';

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
    const selectedProject = useMemo(
        () => TOKEN_PRESETS.find((token) => token.id === purchaseProject),
        [purchaseProject],
    );
    const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
    const [purchaseError, setPurchaseError] = useState<string | null>(null);

    const [sellAmount, setSellAmount] = useState('50');
    const [sellPrice, setSellPrice] = useState('1.0'); // Preço em stablecoin por token
    const [sellMessage, setSellMessage] = useState<string | null>(null);
    const [sellError, setSellError] = useState<string | null>(null);

    const [buyAmount, setBuyAmount] = useState('100');
    const [buyPrice, setBuyPrice] = useState('1.0'); // Preço em stablecoin por token
    const [buyMessage, setBuyMessage] = useState<string | null>(null);
    const [buyError, setBuyError] = useState<string | null>(null);

    const [myOffers, setMyOffers] = useState<Offer[]>([]);
    const [loadingOffers, setLoadingOffers] = useState(false);
    const [bookOffers, setBookOffers] = useState<BookOffer[]>([]);
    const [loadingBook, setLoadingBook] = useState(false);
    const [showDEX, setShowDEX] = useState(true); // Toggle entre DEX e pagamento direto

    const [authorized, setAuthorized] = useState(false);
    const [issuerAddress, setIssuerAddress] = useState<string>(
        selectedProject?.issuerAddress ?? '',
    );
    const [mptTrustlineStatus, setMptTrustlineStatus] = useState<'unknown' | 'ok' | 'missing'>('unknown');
    const [mptTrustlineMessage, setMptTrustlineMessage] = useState<string | null>(null);
    const [mptTrustlineError, setMptTrustlineError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function loadStatus() {
            if (!account || !selectedStable) {
                if (!cancelled) {
                    setTrustlineStatus('unknown');
                    setBalance('0');
                }
                return;
            }
            
            // Validar account.address - deve ser string não vazia, começar com 'r' e ter pelo menos 25 caracteres
            const accountAddress = account?.address?.trim();
            if (!accountAddress || 
                typeof accountAddress !== 'string' || 
                accountAddress.length < 25 || 
                !accountAddress.startsWith('r')) {
                console.warn('[Trade] Endereço de conta inválido:', accountAddress);
                if (!cancelled) {
                    setTrustlineStatus('unknown');
                    setBalance('0');
                }
                return;
            }
            
            // Validar selectedStable - deve ter currency e issuer válidos
            const currency = selectedStable?.currency?.trim();
            const issuer = selectedStable?.issuer?.trim();
            
            if (!currency || !issuer) {
                console.warn('[Trade] Currency ou Issuer inválido:', { currency, issuer });
                if (!cancelled) {
                    setTrustlineStatus('unknown');
                    setBalance('0');
                }
                return;
            }
            
            // Validar issuer - deve ser endereço XRPL válido
            if (issuer.length < 25 || !issuer.startsWith('r')) {
                console.warn('[Trade] Issuer inválido:', issuer);
                if (!cancelled) {
                    setTrustlineStatus('unknown');
                    setBalance('0');
                }
                return;
            }
            
            // Validar network
            const network = (account.network && 
                           (account.network === 'testnet' || account.network === 'mainnet' || account.network === 'devnet'))
                          ? account.network 
                          : 'testnet';
            
            try {
                const hasLine = await hasTrustLine({
                    account: accountAddress,
                    currency: currency,
                    issuer: issuer,
                    network: network,
                });
                if (!cancelled) {
                    setTrustlineStatus(hasLine ? 'ok' : 'missing');
                }

                const bal = await getAccountBalance({
                    account: accountAddress,
                    currency: currency,
                    issuer: issuer,
                    network: network,
                });
                if (!cancelled) {
                    setBalance(bal);
                }
            } catch (error: any) {
                // Ignorar erros de "Account malformed" - pode ser que a conta ainda não existe na rede
                if (error?.message?.includes('Account malformed') || 
                    error?.message?.includes('actNotFound') ||
                    error?.name === 'RippledError') {
                    console.warn('[Trade] Conta pode não existir ainda ou endereço inválido:', error.message);
                    if (!cancelled) {
                        setTrustlineStatus('unknown');
                        setBalance('0');
                    }
                    return;
                }
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
        setIssuerAddress(selectedProject?.issuerAddress ?? '');
        setMptTrustlineStatus('unknown');
        setMptTrustlineMessage(null);
        setMptTrustlineError(null);
    }, [purchaseProject, selectedProject]);

    useEffect(() => {
        setMptTrustlineMessage(null);
        setMptTrustlineError(null);
    }, [issuerAddress]);

    useEffect(() => {
        const currentAccount = account;
        const project = selectedProject;

        if (!currentAccount || !project) {
            setMptTrustlineStatus('unknown');
            return;
        }

        const resolvedIssuer = ((issuerAddress && issuerAddress.trim()) || project.issuerAddress || '').trim();

        if (!resolvedIssuer) {
            setMptTrustlineStatus('missing');
            return;
        }

        const safeAccount = currentAccount;
        const safeProject = project;

        let cancelled = false;
        async function checkMptTrustline() {
            try {
                const hasLine = await hasTrustLine({
                    account: safeAccount.address,
                    currency: safeProject.currency,
                    issuer: resolvedIssuer,
                    network: safeAccount.network,
                });
                if (!cancelled) {
                    setMptTrustlineStatus(hasLine ? 'ok' : 'missing');
                }
            } catch (error) {
                console.warn('[Trade] Falha ao verificar trustline do MPT', error);
                if (!cancelled) {
                    setMptTrustlineStatus('unknown');
                }
            }
        }

        checkMptTrustline();

        return () => {
            cancelled = true;
        };
    }, [account, selectedProject, issuerAddress]);

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
        setMptTrustlineStatus('unknown');
        setMptTrustlineMessage(null);
        setMptTrustlineError(null);
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
        setPurchaseError(null);
        setPurchaseMessage(null);
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
                type: 'trustset',
                token: { currency: selectedStable.currency, issuer: selectedStable.issuer },
                actor: account.address,
                network: account.network,
                txHash: hash ?? 'trustline',
                metadata: { limit: '1000000' },
            });
        } catch (error: any) {
            console.error('Erro ao criar trustline:', error);
            const errorMessage = error?.message || 'Falha ao criar trustline';
            
            // Detectar se é erro de TrustSet não suportado pela Crossmark
            const isTrustSetNotSupported = 
                errorMessage.includes('TrustSet') && 
                (errorMessage.includes('não suporta') || 
                 errorMessage.includes('does not have') ||
                 errorMessage.includes('TransactionType'));
            
            if (isTrustSetNotSupported) {
                // Mensagem mais clara com alternativas
                setPurchaseError(
                    `A extensão Crossmark não suporta criação de trustlines (TrustSet).\n\n` +
                    `Alternativas:\n` +
                    `• Use xumm.app ou xrptoolkit.com para criar a trustline\n` +
                    `• Ou aguarde uma atualização da Crossmark\n\n` +
                    `Token: ${selectedStable.currency} (${selectedStable.label})`
                );
            } else {
                setPurchaseError(errorMessage);
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedStable]);

    const handleCreateMptTrustline = useCallback(async () => {
        const currentAccount = account;
        const project = selectedProject;

        if (!currentAccount || !project) {
            setMptTrustlineError('Conecte sua carteira e selecione um token.');
            return;
        }

        const resolvedIssuer = ((issuerAddress && issuerAddress.trim()) || project.issuerAddress || '').trim();

        if (!resolvedIssuer) {
            setMptTrustlineError('Informe o endereço do emissor para criar a trustline do MPT.');
            return;
        }

        // Validar formato do endereço do emissor
        if (!resolvedIssuer.startsWith('r') || resolvedIssuer.length < 25) {
            setMptTrustlineError('Endereço do emissor inválido. Deve começar com "r" e ter pelo menos 25 caracteres.');
            return;
        }

        setIsSubmitting(true);
        setMptTrustlineMessage(null);
        setMptTrustlineError(null);

        try {
            console.log('[Trade] Criando trustline do MPT:', {
                account: currentAccount.address,
                currency: project.currency,
                issuer: resolvedIssuer,
            });

            const response = await trustSetToken({
                account: currentAccount.address,
                currency: project.currency,
                issuer: resolvedIssuer,
                limit: '1000000000',
            });

            const hash = extractTransactionHash(response);
            console.log('[Trade] Trustline criada com sucesso. Hash:', hash);

            // Registrar ação no backend
            try {
                await registerAction({
                    type: 'trustset',
                    token: { currency: project.currency, issuer: resolvedIssuer },
                    actor: currentAccount.address,
                    network: currentAccount.network,
                    txHash: hash ?? 'trustline',
                    metadata: { limit: '1000000000', scope: 'mpt' },
                });
            } catch (registerError) {
                console.warn('[Trade] Erro ao registrar ação (não crítico):', registerError);
                // Não falha a operação se o registro falhar
            }

            setMptTrustlineStatus('ok');
            setMptTrustlineMessage(`Trustline para ${project.currency} configurada com sucesso.`);
        } catch (error: any) {
            console.error('[Trade] Erro ao criar trustline do MPT:', error);
            
            // Extrair mensagem de erro mais detalhada
            let errorMessage = 'Falha ao criar trustline do MPT.';
            
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            
            // Detectar se é erro de TrustSet não suportado pela Crossmark
            const isTrustSetNotSupported = 
                errorMessage.includes('TrustSet') && 
                (errorMessage.includes('não suporta') || 
                 errorMessage.includes('does not have') ||
                 errorMessage.includes('TransactionType'));
            
            if (isTrustSetNotSupported) {
                errorMessage = 
                    `A extensão Crossmark não suporta criação de trustlines (TrustSet).\n\n` +
                    `Alternativas:\n` +
                    `• Use xumm.app ou xrptoolkit.com para criar a trustline\n` +
                    `• Ou aguarde uma atualização da Crossmark\n\n` +
                    `Token: ${project.currency}`;
            } else if (error?.message) {
                errorMessage = error.message;
            } else if (error?.data?.result?.engine_result_message) {
                errorMessage = error.data.result.engine_result_message;
            } else if (error?.data?.message) {
                errorMessage = error.data.message;
            } else if (error?.response?.data?.result?.engine_result_message) {
                errorMessage = error.response.data.result.engine_result_message;
            }

            // Mensagens de erro mais amigáveis
            if (errorMessage.toLowerCase().includes('rejected') || errorMessage.toLowerCase().includes('canceled') || errorMessage.toLowerCase().includes('cancelled')) {
                errorMessage = 'Transação cancelada pelo usuário.';
            } else if (errorMessage.toLowerCase().includes('insufficient')) {
                errorMessage = 'Saldo insuficiente para criar trustline. Você precisa de XRP para pagar a taxa de transação.';
            } else if (errorMessage.toLowerCase().includes('invalid') || errorMessage.toLowerCase().includes('malformed')) {
                errorMessage = 'Dados inválidos. Verifique o endereço do emissor e tente novamente.';
            } else if (errorMessage.toLowerCase().includes('tec')) {
                errorMessage = `Erro na transação: ${errorMessage}. Verifique se você tem saldo suficiente e se o token existe.`;
            }

            setMptTrustlineError(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedProject, issuerAddress]);

    const loadMyOffers = useCallback(async () => {
        if (!account) return;
        setLoadingOffers(true);
        try {
            const offers = await getAccountOffers(account.address, account.network);
            setMyOffers(offers);
        } catch (error) {
            console.error('Erro ao carregar ofertas:', error);
        } finally {
            setLoadingOffers(false);
        }
    }, [account]);

    const loadBookOffers = useCallback(async () => {
        if (!account || !selectedProject) return;
        setLoadingBook(true);
        try {
            const resolvedIssuer = (issuerAddress && issuerAddress.trim()) || selectedProject.issuerAddress?.trim() || '';
            if (!resolvedIssuer) return;

            const takerGets = {
                currency: selectedProject.currency,
                issuer: resolvedIssuer,
            };
            const takerPays = selectedStable 
                ? { currency: selectedStable.currency, issuer: selectedStable.issuer }
                : 'XRP';

            const offers = await getBookOffers(takerGets, takerPays, account.network, 20);
            setBookOffers(offers);
        } catch (error) {
            console.error('Erro ao carregar book de ofertas:', error);
        } finally {
            setLoadingBook(false);
        }
    }, [account, selectedProject, selectedStable, issuerAddress]);

    const handleAuthorizeInvestor = useCallback(async () => {
        const currentAccount = account;
        const project = selectedProject;

        if (!currentAccount || !selectedStable || !project) return;

        const resolvedIssuer = (issuerAddress || project.issuerAddress || currentAccount.address).trim();

        setIsSubmitting(true);
        try {
            const response = await authorizeMPToken({
                issuer: resolvedIssuer,
                currency: project.currency,
                holder: currentAccount.address,
                authorize: true,
            });
            const hash = extractTransactionHash(response);
            setAuthorized(true);
            setPurchaseMessage('Autorização solicitada. Confirme na Crossmark.');
            setPurchaseError(null);
            await registerAction({
                type: 'authorize',
                token: {
                    currency: project.currency,
                    issuer: resolvedIssuer,
                },
                actor: currentAccount.address,
                network: currentAccount.network,
                txHash: hash ?? 'authorize',
                metadata: { project: project.id, holder: currentAccount.address },
            });
        } catch (error) {
            console.error('Erro ao autorizar investidor:', error);
            setPurchaseError(error instanceof Error ? error.message : 'Falha ao autorizar investidor');
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedStable, selectedProject, issuerAddress]);

    const handlePurchase = useCallback(async () => {
        const currentAccount = account;
        const project = selectedProject;

        if (!currentAccount || !selectedStable || !project) return;

        if (trustlineStatus !== 'ok') {
            setPurchaseError('Crie a trustline para o stablecoin antes de comprar.');
            return;
        }

        if (mptTrustlineStatus !== 'ok') {
            setPurchaseError('Crie a trustline do token antes de comprar.');
            return;
        }

        const resolvedIssuer =
            (issuerAddress && issuerAddress.trim()) || project.issuerAddress?.trim() || '';
        if (!resolvedIssuer) {
            setPurchaseError('Informe o endereço do emissor para concluir a compra.');
            return;
        }

        setIsSubmitting(true);
        setPurchaseError(null);
        setPurchaseMessage(null);

        try {
            if (showDEX) {
                // Usar DEX: criar oferta de compra
                // TakerGets: token que queremos receber
                // TakerPays: stablecoin que vamos pagar
                const takerGets = {
                    currency: project.currency,
                    issuer: resolvedIssuer,
                    value: purchaseAmount,
                };
                const takerPays = {
                    currency: selectedStable.currency,
                    issuer: selectedStable.issuer,
                    value: (parseFloat(purchaseAmount) * parseFloat(buyPrice)).toFixed(6),
                };

                const hash = await createOffer({
                    account: currentAccount.address,
                    takerGets,
                    takerPays,
                    network: currentAccount.network,
                });

                await registerAction({
                    type: 'dex_offer',
                    token: { currency: project.currency, issuer: resolvedIssuer },
                    actor: currentAccount.address,
                    network: currentAccount.network,
                    txHash: hash,
                    metadata: { 
                        project: project.id,
                        type: 'buy',
                        amount: purchaseAmount,
                        price: buyPrice,
                    },
                });

                setPurchaseMessage(`Oferta de compra criada no DEX! Hash: ${hash.slice(0, 8)}...`);
                // Recarregar ofertas
                loadMyOffers();
                loadBookOffers();
            } else {
                // Pagamento direto (modo legado)
                const response = await sendMPToken({
                    sender: currentAccount.address,
                    destination: resolvedIssuer,
                    amount: purchaseAmount,
                    currency: selectedStable.currency,
                    issuer: selectedStable.issuer,
                    memo: `Compra ${project.label}`,
                });
                const hash = extractTransactionHash(response);

                await registerAction({
                    type: 'payment',
                    token: { currency: selectedStable.currency, issuer: selectedStable.issuer },
                    actor: currentAccount.address,
                    target: resolvedIssuer,
                    amount: purchaseAmount,
                    network: currentAccount.network,
                    txHash: hash ?? 'payment',
                    metadata: { project: project.id },
                });

                setPurchaseMessage('Pagamento enviado. Aguarde o recebimento do token pelo emissor.');
            }
            refreshAccount();
        } catch (error) {
            console.error('Erro ao comprar token:', error);
            setPurchaseError(error instanceof Error ? error.message : 'Falha ao executar operação.');
        } finally {
            setIsSubmitting(false);
        }
    }, [
        account,
        selectedStable,
        selectedProject,
        purchaseAmount,
        buyPrice,
        trustlineStatus,
        mptTrustlineStatus,
        refreshAccount,
        issuerAddress,
        showDEX,
        loadMyOffers,
        loadBookOffers,
    ]);

    const handleSell = useCallback(async () => {
        const currentAccount = account;
        const project = selectedProject;

        if (!currentAccount || !selectedStable || !project) return;

        if (mptTrustlineStatus !== 'ok') {
            setSellError('Crie a trustline do token antes de vender.');
            return;
        }

        const resolvedIssuer =
            (issuerAddress && issuerAddress.trim()) || project.issuerAddress?.trim() || '';
        if (!resolvedIssuer) {
            setSellError('Informe o endereço do emissor para concluir a venda.');
            return;
        }

        setIsSubmitting(true);
        setSellError(null);
        setSellMessage(null);

        try {
            if (showDEX) {
                // Usar DEX: criar oferta de venda
                // TakerGets: stablecoin que queremos receber
                // TakerPays: token que vamos vender
                const takerGets = {
                    currency: selectedStable.currency,
                    issuer: selectedStable.issuer,
                    value: (parseFloat(sellAmount) * parseFloat(sellPrice)).toFixed(6),
                };
                const takerPays = {
                    currency: project.currency,
                    issuer: resolvedIssuer,
                    value: sellAmount,
                };

                const hash = await createOffer({
                    account: currentAccount.address,
                    takerGets,
                    takerPays,
                    network: currentAccount.network,
                });

                await registerAction({
                    type: 'dex_offer',
                    token: { currency: project.currency, issuer: resolvedIssuer },
                    actor: currentAccount.address,
                    network: currentAccount.network,
                    txHash: hash,
                    metadata: { 
                        project: project.id,
                        type: 'sell',
                        amount: sellAmount,
                        price: sellPrice,
                    },
                });

                setSellMessage(`Oferta de venda criada no DEX! Hash: ${hash.slice(0, 8)}...`);
                // Recarregar ofertas
                loadMyOffers();
                loadBookOffers();
            } else {
                // Pagamento direto (modo legado)
                const response = await sendMPToken({
                    sender: currentAccount.address,
                    destination: resolvedIssuer,
                    amount: sellAmount,
                    currency: project.currency,
                    issuer: resolvedIssuer,
                    memo: 'Venda MPT',
                });
                const hash = extractTransactionHash(response);

                await registerAction({
                    type: 'payment',
                    token: { currency: project.currency, issuer: resolvedIssuer },
                    actor: currentAccount.address,
                    target: resolvedIssuer,
                    amount: sellAmount,
                    network: currentAccount.network,
                    txHash: hash ?? 'sell',
                    metadata: { project: project.id, action: 'sell' },
                });

                setSellMessage('Token enviado ao emissor. Liquidação será processada manualmente.');
            }
            refreshAccount();
        } catch (error) {
            console.error('Erro ao vender token:', error);
            setSellError(error instanceof Error ? error.message : 'Falha ao executar venda.');
        } finally {
            setIsSubmitting(false);
        }
    }, [account, selectedStable, selectedProject, sellAmount, sellPrice, mptTrustlineStatus, refreshAccount, issuerAddress, showDEX, loadMyOffers, loadBookOffers]);

    const handleCancelOffer = useCallback(async (sequence: number) => {
        if (!account) return;
        setIsSubmitting(true);
        try {
            const hash = await cancelOffer(account.address, sequence, account.network);
            setSellMessage(`Oferta cancelada! Hash: ${hash.slice(0, 8)}...`);
            await loadMyOffers();
            await loadBookOffers();
        } catch (error) {
            console.error('Erro ao cancelar oferta:', error);
            setSellError(error instanceof Error ? error.message : 'Falha ao cancelar oferta.');
        } finally {
            setIsSubmitting(false);
        }
    }, [account, loadMyOffers, loadBookOffers]);

    // Carregar ofertas quando conectar ou mudar token
    useEffect(() => {
        if (account && showDEX) {
            loadMyOffers();
            loadBookOffers();
        }
    }, [account, selectedProject, issuerAddress, selectedStable, showDEX, loadMyOffers, loadBookOffers]);

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
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                                Trustline do token:{' '}
                                {mptTrustlineStatus === 'ok' ? (
                                    <span className="text-green-600 dark:text-green-400">Configurada</span>
                                ) : mptTrustlineStatus === 'missing' ? (
                                    <span className="text-red-600 dark:text-red-400">Ausente</span>
                                ) : (
                                    <span className="text-gray-500 dark:text-gray-400">Desconhecida</span>
                                )}
                            </div>
                            <button
                                onClick={handleCreateMptTrustline}
                                disabled={mptTrustlineStatus === 'ok' || isSubmitting || !isConnected}
                                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow disabled:opacity-50"
                            >
                                Criar trustline do token
                            </button>
                            {mptTrustlineMessage && (
                                <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                                    <Check className="w-4 h-4 mt-0.5" /> {mptTrustlineMessage}
                                </div>
                            )}
                            {mptTrustlineError && (
                                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                    <AlertCircle className="w-4 h-4 mt-0.5" /> {mptTrustlineError}
                                </div>
                            )}
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
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                <DollarSign className="w-5 h-5" /> Comprar tokens
                            </h3>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={showDEX}
                                    onChange={(e) => setShowDEX(e.target.checked)}
                                    className="rounded"
                                />
                                <span className="text-gray-600 dark:text-gray-400">Usar DEX</span>
                            </label>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {showDEX 
                                ? `Crie uma oferta de compra no DEX. A oferta será executada automaticamente quando alguém aceitar.`
                                : `Envie ${selectedStable?.currency} para o emissor e receba o token Terra.FI correspondente.`}
                        </p>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Quantidade de tokens
                            </label>
                            <input
                                value={purchaseAmount}
                                onChange={(event) => setPurchaseAmount(event.target.value)}
                                placeholder="100"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        {showDEX && (
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    Preço por token ({selectedStable?.currency})
                                </label>
                                <input
                                    value={buyPrice}
                                    onChange={(event) => setBuyPrice(event.target.value)}
                                    placeholder="1.0"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Total: {(parseFloat(purchaseAmount || '0') * parseFloat(buyPrice || '0')).toFixed(6)} {selectedStable?.currency}
                                </p>
                            </div>
                        )}
                        <button
                            onClick={handlePurchase}
                            disabled={isSubmitting || !isConnected}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                        >
                            {showDEX ? 'Criar oferta de compra' : 'Enviar pagamento'}
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
                            {showDEX
                                ? `Crie uma oferta de venda no DEX. A oferta será executada automaticamente quando alguém aceitar.`
                                : `Envie MPTs de volta ao emissor para liquidação manual. Use para amortizações ou saída de posição.`}
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
                        {showDEX && (
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    Preço por token ({selectedStable?.currency})
                                </label>
                                <input
                                    value={sellPrice}
                                    onChange={(event) => setSellPrice(event.target.value)}
                                    placeholder="1.0"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Total: {(parseFloat(sellAmount || '0') * parseFloat(sellPrice || '0')).toFixed(6)} {selectedStable?.currency}
                                </p>
                            </div>
                        )}
                        <button
                            onClick={handleSell}
                            disabled={isSubmitting || !isConnected}
                            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow disabled:opacity-60"
                        >
                            {showDEX ? 'Criar oferta de venda' : 'Enviar token ao emissor'}
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
