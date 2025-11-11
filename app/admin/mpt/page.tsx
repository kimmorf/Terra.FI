'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Wallet,
    Send,
    Sparkles,
    Layers,
    Check,
    AlertCircle,
    Copy,
    RefreshCw,
    ArrowRight,
    Building2,
    Coins,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';
import { listMPTs, sendMPT } from '@/lib/mpt/api';
import { buildMPTokenIssuanceTransaction, signAndSubmitTransaction, extractTransactionHash } from '@/lib/crossmark/transactions';
import { extractIssuanceIDWithFallback } from '@/lib/crossmark/issuance-id-extractor';
import { crossmarkSign } from '@/lib/crossmark/helpers';
import { TOKEN_PRESETS, TOKEN_CONFIG, type TokenPreset } from '@/lib/tokens/presets';
import type { MPTokenMetadata } from '@/lib/crossmark/types';

type Tab = 'emitir' | 'transferir' | 'listar';

function convertToBaseUnits(value: string, decimals: number): string | null {
    const sanitized = value.replace(/,/g, '').trim();
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

export default function AdminMPTPage() {
    const {
        isConnected,
        account,
        connect,
        disconnect,
        refreshAccount,
    } = useCrossmarkContext();

    const [activeTab, setActiveTab] = useState<Tab>('listar');
    const [issuedTokens, setIssuedTokens] = useState<any[]>([]);
    const [loadingTokens, setLoadingTokens] = useState(false);

    // Estado para Emitir
    const [selectedPreset, setSelectedPreset] = useState<TokenPreset | null>(TOKEN_PRESETS[0] || null);
    const [supply, setSupply] = useState<string>('');
    const [tokenName, setTokenName] = useState<string>('');
    const [isIssuing, setIsIssuing] = useState(false);
    const [issuanceError, setIssuanceError] = useState<string | null>(null);
    const [issuanceSuccess, setIssuanceSuccess] = useState<string | null>(null);

    // Estado para Transferir
    const [transferIssuanceId, setTransferIssuanceId] = useState<string>('');
    const [transferDestination, setTransferDestination] = useState<string>('');
    const [transferAmount, setTransferAmount] = useState<string>('');
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferError, setTransferError] = useState<string | null>(null);
    const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const loadIssuedTokens = useCallback(async () => {
        if (!account?.address) return;

        setLoadingTokens(true);
        try {
            const data = await listMPTs({
                issuer: account.address,
                network: account.network,
            });
            setIssuedTokens(data.tokens || []);
        } catch (error) {
            console.error('[Admin MPT] Erro ao carregar MPTs:', error);
            setIssuedTokens([]);
        } finally {
            setLoadingTokens(false);
        }
    }, [account]);

    useEffect(() => {
        if (account?.address && isConnected) {
            loadIssuedTokens();
        }
    }, [account?.address, isConnected, loadIssuedTokens]);

    const handleEmit = async () => {
        if (!account || !selectedPreset) {
            setIssuanceError('Conecte sua carteira e selecione um tipo de token');
            return;
        }

        if (!tokenName.trim()) {
            setIssuanceError('Informe um nome para o token');
            return;
        }

        const config = TOKEN_CONFIG[selectedPreset.id];
        const baseUnits = convertToBaseUnits(supply || selectedPreset.defaultSupply, config.decimals);

        if (!baseUnits) {
            setIssuanceError(`Valor de emissão inválido. Utilize números positivos com até ${config.decimals} casas decimais.`);
            return;
        }

        setIsIssuing(true);
        setIssuanceError(null);
        setIssuanceSuccess(null);

        try {
            const metadata: MPTokenMetadata = {
                ...selectedPreset.metadata,
                name: tokenName.trim(),
                issuedAt: new Date().toISOString(),
            };

            const transaction = buildMPTokenIssuanceTransaction({
                issuer: account.address,
                assetScale: config.decimals,
                maximumAmount: baseUnits,
                transferFee: 0,
                flags: {
                    canTransfer: config.transferable,
                },
                metadata,
            });

            const response = await signAndSubmitTransaction(transaction);
            
            // Verificar se a resposta contém erro antes de tentar extrair hash
            const responseObj = response as any;
            const hasError = 
                responseObj?.response?.data?.errorMessage ||
                responseObj?.data?.errorMessage ||
                responseObj?.errorMessage;
            
            if (hasError) {
                // O erro já foi lançado pela função signAndSubmitTransaction
                // Mas se chegou aqui, significa que não foi capturado corretamente
                throw new Error(hasError || 'Erro ao processar transação');
            }
            
            const hash = extractTransactionHash(response);

            if (!hash) {
                throw new Error('Não foi possível recuperar o hash da transação. A transação pode ter falhado.');
            }

            const issuanceIdHex = await extractIssuanceIDWithFallback(
                response,
                hash,
                account.network as 'testnet' | 'mainnet' | 'devnet'
            );

            setIssuanceSuccess(`Token emitido com sucesso! TX: ${hash.slice(0, 16)}...`);
            
            // Limpar formulário
            setSupply('');
            setTokenName('');
            
            // Recarregar lista
            await loadIssuedTokens();
        } catch (error: any) {
            setIssuanceError(error.message || 'Erro ao emitir token');
        } finally {
            setIsIssuing(false);
        }
    };

    const handleTransfer = async () => {
        if (!account) {
            setTransferError('Conecte sua carteira');
            return;
        }

        if (!transferIssuanceId.trim() || !transferDestination.trim() || !transferAmount.trim()) {
            setTransferError('Preencha todos os campos');
            return;
        }

        setIsTransferring(true);
        setTransferError(null);
        setTransferSuccess(null);

        try {
            // Buscar informações do token para obter assetScale
            const token = issuedTokens.find(t => t.issuanceIdHex === transferIssuanceId);
            const assetScale = token?.assetScale || 0;
            const amountInBaseUnits = convertToBaseUnits(transferAmount, assetScale);

            if (!amountInBaseUnits) {
                throw new Error(`Valor inválido. Utilize números com até ${assetScale} casas decimais.`);
            }

            // Preparar transação Payment
            const tx: any = {
                TransactionType: 'Payment',
                Account: account.address,
                Destination: transferDestination.trim(),
                Amount: {
                    mpt_issuance_id: transferIssuanceId.trim(),
                    value: amountInBaseUnits,
                },
            };

            // Tenta autofill via API, senão deixa Crossmark fazer
            let prepared = tx;
            try {
                const autofillResponse = await fetch('/api/xrpl/autofill', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tx, network: account.network }),
                });
                
                if (autofillResponse.ok) {
                    const data = await autofillResponse.json();
                    prepared = data.prepared || tx;
                }
            } catch (autofillError) {
                // Fallback: usar tx sem autofill e deixar Crossmark fazer
                console.warn('[Admin MPT] Autofill falhou, usando tx crua:', autofillError);
            }

            // Assinar com Crossmark (que também pode fazer autofill)
            const txBlob = await crossmarkSign(prepared);

            // Enviar
            const result = await sendMPT({
                mptIssuanceIdHex: transferIssuanceId.trim(),
                amount: amountInBaseUnits,
                destination: transferDestination.trim(),
                txBlob,
                network: account.network,
            });

            setTransferSuccess(`Transferência realizada! TX: ${result.txHash?.slice(0, 16)}...`);
            
            // Limpar formulário
            setTransferIssuanceId('');
            setTransferDestination('');
            setTransferAmount('');
            
            // Recarregar lista
            await loadIssuedTokens();
        } catch (error: any) {
            setTransferError(error.message || 'Erro ao transferir MPT');
        } finally {
            setIsTransferring(false);
        }
    };

    const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'emitir', label: 'Emitir MPT', icon: Sparkles },
        { id: 'transferir', label: 'Transferir MPT', icon: Send },
        { id: 'listar', label: 'MPTs Emitidos', icon: Layers },
    ];

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
                                <Building2 className="w-10 h-10" />
                                Administração de MPTs
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">
                                Gerencie emissão, transferência e listagem de Multi-Purpose Tokens
                            </p>
                        </div>
                        {isConnected && account ? (
                            <div className="flex items-center gap-3">
                                <div className="bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                                            {account.address.slice(0, 10)}...{account.address.slice(-6)}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={disconnect}
                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold"
                                >
                                    Desconectar
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={connect}
                                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                            >
                                <Wallet className="w-5 h-5" /> Conectar Crossmark
                            </button>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg mb-6">
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
                            {/* Tab: Emitir */}
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
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        {preset.summary}
                                                    </div>
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
                                                onChange={(e) => setTokenName(e.target.value)}
                                                placeholder="Ex: LAND-MPT - Lote 12"
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
                                                onChange={(e) => setSupply(e.target.value)}
                                                placeholder={selectedPreset?.defaultSupply || '0'}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                                            />
                                        </div>
                                    </div>

                                    {issuanceError && (
                                        <div className="flex items-start gap-3 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300">
                                            <AlertCircle className="w-5 h-5 mt-1" />
                                            <p className="text-sm">{issuanceError}</p>
                                        </div>
                                    )}

                                    {issuanceSuccess && (
                                        <div className="flex items-start gap-3 p-4 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl text-green-700 dark:text-green-300">
                                            <Check className="w-5 h-5 mt-1" />
                                            <p className="text-sm">{issuanceSuccess}</p>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleEmit}
                                        disabled={isIssuing || !isConnected || !selectedPreset}
                                        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isIssuing ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Emitindo...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-5 h-5" />
                                                Emitir MPT
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Tab: Transferir */}
                            {activeTab === 'transferir' && (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                            MPTokenIssuanceID (Hex) *
                                        </label>
                                        <input
                                            type="text"
                                            value={transferIssuanceId}
                                            onChange={(e) => setTransferIssuanceId(e.target.value)}
                                            placeholder="Cole o ID do token emitido"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 font-mono text-sm"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Ou selecione um token da lista abaixo
                                        </p>
                                    </div>

                                    {issuedTokens.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                Selecionar Token Emitido
                                            </label>
                                            <select
                                                onChange={(e) => {
                                                    const token = issuedTokens.find(t => t.issuanceIdHex === e.target.value);
                                                    if (token) {
                                                        setTransferIssuanceId(token.issuanceIdHex);
                                                    }
                                                }}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                                            >
                                                <option value="">Selecione um token...</option>
                                                {issuedTokens.map((token) => (
                                                    <option key={token.issuanceIdHex} value={token.issuanceIdHex}>
                                                        {token.metadata?.name || 'Token'} - {token.issuanceIdHex.slice(0, 16)}...
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                Destino (Endereço XRPL) *
                                            </label>
                                            <input
                                                type="text"
                                                value={transferDestination}
                                                onChange={(e) => setTransferDestination(e.target.value)}
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
                                                onChange={(e) => setTransferAmount(e.target.value)}
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
                                        disabled={isTransferring || !isConnected}
                                        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isTransferring ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Transferindo...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-5 h-5" />
                                                Transferir MPT
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Tab: Listar */}
                            {activeTab === 'listar' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                                            MPTs Emitidos ({issuedTokens.length})
                                        </h3>
                                        <button
                                            onClick={loadIssuedTokens}
                                            disabled={loadingTokens}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${loadingTokens ? 'animate-spin' : ''}`} />
                                            Atualizar
                                        </button>
                                    </div>

                                    {loadingTokens ? (
                                        <div className="text-center py-8">
                                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                            <p className="text-gray-500 dark:text-gray-400">Carregando...</p>
                                        </div>
                                    ) : issuedTokens.length > 0 ? (
                                        <div className="space-y-3">
                                            {issuedTokens.map((token, index) => (
                                                <div
                                                    key={`${token.issuanceIdHex}-${index}`}
                                                    className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Coins className="w-5 h-5 text-blue-500" />
                                                                <span className="font-semibold text-gray-800 dark:text-white">
                                                                    {token.metadata?.name || 'Token sem nome'}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <strong>ID:</strong>
                                                                    <span className="font-mono">{token.issuanceIdHex.slice(0, 16)}...</span>
                                                                    <button
                                                                        onClick={async () => {
                                                                            try {
                                                                                await navigator.clipboard.writeText(token.issuanceIdHex);
                                                                                setCopiedId(token.issuanceIdHex);
                                                                                setTimeout(() => setCopiedId(null), 2000);
                                                                            } catch (err) {
                                                                                console.error('Erro ao copiar:', err);
                                                                            }
                                                                        }}
                                                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                                                        title="Copiar ID completo"
                                                                    >
                                                                        <Copy className={`w-3 h-3 ${copiedId === token.issuanceIdHex ? 'text-green-500' : ''}`} />
                                                                    </button>
                                                                </div>
                                                                <span>
                                                                    <strong>Asset Scale:</strong> {token.assetScale}
                                                                </span>
                                                                <span>
                                                                    <strong>Max Amount:</strong> {token.maximumAmount}
                                                                </span>
                                                            </div>
                                                            {token.flags && (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {token.flags.canTransfer && (
                                                                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs">
                                                                            Transferível
                                                                        </span>
                                                                    )}
                                                                    {token.flags.requireAuth && (
                                                                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                                                                            Requer Auth
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setTransferIssuanceId(token.issuanceIdHex);
                                                                setActiveTab('transferir');
                                                            }}
                                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                                                        >
                                                            <Send className="w-3 h-3" />
                                                            Transferir
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                            <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>Nenhum MPT emitido ainda</p>
                                            <p className="text-xs mt-1">Use a aba &quot;Emitir MPT&quot; para criar seu primeiro token</p>
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
