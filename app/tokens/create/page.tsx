'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    Wallet,
    Sparkles,
    Layers,
    Check,
    Copy,
    AlertCircle,
    Info,
    ArrowRight,
    Building2,
    Mountain,
    Hammer,
    DollarSign,
    Lock,
    Upload,
    File,
    X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';
import { TOKEN_PRESETS, TOKEN_CONFIG, type TokenPreset } from '@/lib/tokens/presets';
import { buildMPTokenIssuanceTransaction, signAndSubmitTransaction } from '@/lib/crossmark/transactions';
import type { MPTokenMetadata } from '@/lib/crossmark/types';
import { registerIssuance } from '@/lib/elysia-client';
import { listMPTs } from '@/lib/mpt/api';
import { extractIssuanceIDWithFallback } from '@/lib/crossmark/issuance-id-extractor';

const iconMap: Record<string, React.ElementType> = {
    LAND: Mountain,
    BUILD: Hammer,
    REV: DollarSign,
    COL: Lock,
};

const explorerByNetwork: Record<string, string> = {
    mainnet: 'https://livenet.xrpl.org/transactions/',
    testnet: 'https://testnet.xrpl.org/transactions/',
    devnet: 'https://devnet.xrpl.org/transactions/',
};

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

function getExplorerUrl(network: string | undefined, txHash: string | null): string | null {
    if (!network || !txHash) return null;
    const base = explorerByNetwork[network];
    if (!base) return null;
    return `${base}${txHash}`;
}

export default function TokenFactoryPage() {
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

    const [supply, setSupply] = useState<string>(selectedPreset?.defaultSupply ?? '0');
    const [tokenName, setTokenName] = useState<string>(selectedPreset?.metadata.name ?? '');
    const [tokenPurpose, setTokenPurpose] = useState<string>(selectedPreset?.metadata.purpose ?? '');
    const [tokenDescription, setTokenDescription] = useState<string>(selectedPreset?.metadata.description ?? '');
    const [geolocation, setGeolocation] = useState<string>(selectedPreset?.metadata.geolocation ?? '');
    const [legalReference, setLegalReference] = useState<string>(selectedPreset?.metadata.legalReference ?? '');
    const [externalUrl, setExternalUrl] = useState<string>(selectedPreset?.metadata.externalUrl ?? '');

    const [copied, setCopied] = useState(false);
    const [isIssuing, setIsIssuing] = useState(false);
    const [issuanceError, setIssuanceError] = useState<string | null>(null);
    const [issuanceSuccess, setIssuanceSuccess] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [issuedTokens, setIssuedTokens] = useState<any[]>([]);
    const [loadingTokens, setLoadingTokens] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileDescriptions, setFileDescriptions] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!selectedPreset) {
            return;
        }

        setSupply(selectedPreset.defaultSupply);
        setTokenName(selectedPreset.metadata.name ?? '');
        setTokenPurpose(selectedPreset.metadata.purpose ?? '');
        setTokenDescription(selectedPreset.metadata.description ?? '');
        setGeolocation(selectedPreset.metadata.geolocation ?? '');
        setLegalReference(selectedPreset.metadata.legalReference ?? '');
        setExternalUrl(selectedPreset.metadata.externalUrl ?? '');
        setIssuanceError(null);
        setIssuanceSuccess(null);
        setTxHash(null);
    }, [selectedPreset]);

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
            console.error('[TokenFactory] Erro ao carregar MPTs emitidos:', error);
            setIssuedTokens([]);
        } finally {
            setLoadingTokens(false);
        }
    }, [account]);

    const handleConnect = useCallback(async () => {
        try {
            const success = await connect();
            if (success) {
                refreshAccount();
                // Carregar MPTs emitidos após conectar
                if (account) {
                    loadIssuedTokens();
                }
            }
        } catch (error) {
            console.error('[TokenFactory] erro ao conectar Crossmark', error);
        }
    }, [connect, refreshAccount, account, loadIssuedTokens]);

    useEffect(() => {
        if (account?.address && isConnected) {
            loadIssuedTokens();
        }
    }, [account?.address, isConnected, loadIssuedTokens]);

    const handleDisconnect = useCallback(() => {
        disconnect();
        setIssuanceError(null);
        setIssuanceSuccess(null);
        setTxHash(null);
    }, [disconnect]);

    const copyAddress = useCallback(() => {
        if (!account?.address || typeof navigator === 'undefined') return;

        navigator.clipboard
            .writeText(account.address)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch((error) => {
                console.error('Erro ao copiar endereço:', error);
            });
    }, [account?.address]);

    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        setSelectedFiles((prev) => [...prev, ...files]);
    }, []);

    const handleRemoveFile = useCallback((index: number) => {
        setSelectedFiles((prev) => {
            const newFiles = prev.filter((_, i) => i !== index);
            const fileId = prev[index].name;
            setFileDescriptions((prev) => {
                const newDescs = { ...prev };
                delete newDescs[fileId];
                return newDescs;
            });
            return newFiles;
        });
    }, []);

    const handleFileDescriptionChange = useCallback((fileName: string, description: string) => {
        setFileDescriptions((prev) => ({
            ...prev,
            [fileName]: description,
        }));
    }, []);

    const formatFileSize = useCallback((bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }, []);

    const handleIssueToken = useCallback(async () => {
        if (!selectedPreset) {
            setIssuanceError('Selecione um tipo de token para emitir.');
            return;
        }

        if (!isConnected || !account) {
            setIssuanceError('Conecte sua carteira Crossmark para emitir tokens.');
            return;
        }

        if (!tokenName.trim()) {
            setIssuanceError('Informe um nome para o token.');
            return;
        }

        const config = TOKEN_CONFIG[selectedPreset.id];
        // Usar supply informado ou valor padrão do preset
        const supplyToUse = supply.trim() || selectedPreset.defaultSupply || '0';
        const baseUnits = convertToBaseUnits(supplyToUse, config.decimals);

        if (!baseUnits) {
            setIssuanceError(
                `Valor de emissão inválido. Utilize números positivos com até ${config.decimals} casas decimais.`,
            );
            return;
        }

        const metadata: MPTokenMetadata = {
            ...selectedPreset.metadata,
            name: tokenName.trim(),
            ...(tokenDescription.trim() ? { description: tokenDescription.trim() } : {}),
            ...(tokenPurpose.trim() ? { purpose: tokenPurpose.trim() } : {}),
            ...(geolocation.trim() ? { geolocation: geolocation.trim() } : {}),
            ...(legalReference.trim() ? { legalReference: legalReference.trim() } : {}),
            ...(externalUrl.trim() ? { externalUrl: externalUrl.trim() } : {}),
            issuedAt: new Date().toISOString(),
        };

        setIsIssuing(true);
        setIssuanceError(null);
        setIssuanceSuccess(null);
        setTxHash(null);

        try {
            // Usa novos campos da especificação XRPL (com compatibilidade para campos antigos)
            const transaction = buildMPTokenIssuanceTransaction({
                issuer: account.address,
                // Novos campos (especificação XRPL)
                assetScale: config.decimals,
                maximumAmount: baseUnits,
                transferFee: 0, // Sem taxa de transferência por padrão
                flags: {
                    canTransfer: config.transferable,
                    // Adiciona outras flags conforme necessário
                },
                metadata,
                // Campos antigos (deprecated, mas mantidos para compatibilidade)
                currency: selectedPreset.currency, // Apenas para referência
                amount: baseUnits, // Fallback
                decimals: config.decimals, // Fallback
                transferable: config.transferable, // Fallback
            });

            const response = await signAndSubmitTransaction(transaction);

            const hash =
                (response as any)?.hash ??
                (response as any)?.result?.hash ??
                (response as any)?.result?.tx_json?.hash ??
                (response as any)?.tx_json?.hash ??
                (response as any)?.response?.hash ??
                (response as any)?.response?.result?.hash ??
                null;

            if (!hash) {
                throw new Error('Não foi possível recuperar o hash da transação.');
            }

            // Extrair MPTokenIssuanceID da resposta ou buscar na XRPL
            const issuanceIdHex = await extractIssuanceIDWithFallback(
                response,
                hash,
                account.network as 'testnet' | 'mainnet' | 'devnet'
            );

            setTxHash(hash);
            setIssuanceSuccess(
                `${selectedPreset.label} emitido com sucesso. Acompanhe a transação diretamente na XRPL.${issuanceIdHex ? ` ID: ${issuanceIdHex.slice(0, 16)}...` : ''}`,
            );

            try {
                await registerIssuance({
                    projectId: selectedPreset.id,
                    projectName: selectedPreset.label,
                    tokenType: selectedPreset.id,
                    currency: selectedPreset.currency,
                    amount: baseUnits,
                    decimals: config.decimals,
                    issuer: account.address,
                    network: account.network,
                    txHash: hash,
                    metadata: {
                        ...metadata,
                        issuanceIdHex, // Incluir MPTokenIssuanceID no metadata
                    },
                });
            } catch (error) {
                console.warn('[TokenFactory] Falha ao registrar emissão no Elysia', error);
            }

            // Criar projeto automaticamente e fazer upload dos arquivos
            if (selectedFiles.length > 0) {
                try {
                    // Criar projeto no banco de dados
                    const projectResponse = await fetch('/api/admin/projects', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            name: tokenName.trim(),
                            type: selectedPreset.id,
                            description: tokenDescription.trim() || null,
                            purpose: tokenPurpose.trim() || selectedPreset.metadata.purpose || 'Tokenização de ativo',
                            example: selectedPreset.metadata.example || null,
                            minAmount: 0,
                            maxAmount: null,
                            targetAmount: parseFloat(supply.replace(/,/g, '')) || 0,
                        }),
                    });

                    if (!projectResponse.ok) {
                        throw new Error('Falha ao criar projeto');
                    }

                    const project = await projectResponse.json();

                    // Fazer upload de cada arquivo
                    for (const file of selectedFiles) {
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('projectId', project.id);
                        formData.append('description', fileDescriptions[file.name] || '');

                        const uploadResponse = await fetch('/api/admin/projects/files', {
                            method: 'POST',
                            body: formData,
                        });

                        if (!uploadResponse.ok) {
                            console.warn(`[TokenFactory] Falha ao fazer upload do arquivo ${file.name}`);
                        }
                    }

                    console.log(`[TokenFactory] ${selectedFiles.length} arquivo(s) enviado(s) para o projeto ${project.id}`);
                } catch (error) {
                    console.error('[TokenFactory] Erro ao criar projeto ou fazer upload de arquivos:', error);
                    // Não falha a emissão do token se o upload de arquivos falhar
                }
            }

            refreshAccount();
            // Recarregar lista de MPTs emitidos
            await loadIssuedTokens();
            
            // Limpar arquivos selecionados após sucesso
            setSelectedFiles([]);
            setFileDescriptions({});
        } catch (error) {
            console.error('Erro ao emitir token:', error);
            const message =
                error instanceof Error ? error.message : 'Erro desconhecido ao emitir o token.';
            setIssuanceError(message);
        } finally {
            setIsIssuing(false);
        }
    }, [
        account,
        isConnected,
        selectedPreset,
        supply,
        tokenName,
        tokenDescription,
        tokenPurpose,
        geolocation,
        legalReference,
        externalUrl,
        refreshAccount,
        loadIssuedTokens,
        selectedFiles,
        fileDescriptions,
    ]);

    const explorerUrl = getExplorerUrl(account?.network, txHash);
    const Icon = selectedPreset ? iconMap[selectedPreset.id] ?? Layers : Layers;

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300 relative overflow-hidden">
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
                        <Sparkles className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                            Terra.FI Token Factory
                        </h1>
                    </div>
                    <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300">
                        Emita LAND, BUILD, REV e COL com metadados XLS-89 seguindo o blueprint do{' '}
                        <Link
                            href="/Terra_fi.md"
                            className="text-blue-600 dark:text-blue-400 underline font-semibold"
                        >
                            Terra.FI Protocol
                        </Link>
                        . Conecte sua Crossmark, escolha o preset e gere tokens prontos para XRPL.
                    </p>
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
                                Conecte sua carteira XRPL para assinar as transações de emissão.
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
                                        {`${account.address.slice(0, 10)}...${account.address.slice(-6)}`}
                                    </span>
                                    <button
                                        onClick={copyAddress}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                        aria-label="Copiar endereço"
                                    >
                                        {copied ? (
                                            <Check className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-gray-500" />
                                        )}
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
                                Não detectamos a extensão Crossmark. Baixe em{' '}
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
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                                    <Layers className="w-5 h-5" /> Tipos de Token
                                </h3>
                                <div className="space-y-3">
                                    {TOKEN_PRESETS.map((preset) => {
                                        const IconPreset = iconMap[preset.id] ?? Layers;
                                        const isActive = preset.id === selectedTokenId;
                                        return (
                                            <button
                                                key={preset.id}
                                                onClick={() => setSelectedTokenId(preset.id)}
                                                className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${isActive
                                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-lg'
                                                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 hover:border-blue-300 dark:hover:border-blue-600'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className={`p-3 rounded-xl ${isActive
                                                            ? 'bg-gradient-to-br from-blue-500 to-purple-500 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                        }`}>
                                                        <IconPreset className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="text-lg font-semibold mb-1">{preset.label}</h4>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            {preset.summary}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {selectedPreset && (
                                <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <Icon className="w-8 h-8 text-blue-500" />
                                        <div>
                                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                                                {selectedPreset.label}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {selectedPreset.description}
                                            </p>
                                        </div>
                                    </div>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                        {selectedPreset.highlights.map((highlight) => (
                                            <li key={highlight}>{highlight}</li>
                                        ))}
                                    </ul>
                                    <div className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-2">
                                        <Info className="w-4 h-4" />
                                        Decimais: {TOKEN_CONFIG[selectedPreset.id].decimals} • Transferível:{' '}
                                        {TOKEN_CONFIG[selectedPreset.id].transferable ? 'Sim' : 'Não'}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-500">
                                        Sugestão inicial de supply: {selectedPreset.defaultSupply} tokens
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-3">
                            <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 space-y-6">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <Building2 className="w-5 h-5" /> Configurar emissão
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Name (obrigatório)
                                        </label>
                                        <input
                                            value={tokenName}
                                            onChange={(event) => setTokenName(event.target.value)}
                                            placeholder="Ex: LAND-MPT - Lote 12"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Supply a emitir ({TOKEN_CONFIG[selectedTokenId]?.decimals} casas decimais) <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                                        </label>
                                        <input
                                            value={supply}
                                            onChange={(event) => setSupply(event.target.value)}
                                            placeholder={selectedPreset?.defaultSupply}
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Se não informado, será usado o valor padrão do tipo de token ({selectedPreset?.defaultSupply || '0'}).
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Descrição
                                    </label>
                                    <textarea
                                        value={tokenDescription}
                                        onChange={(event) => setTokenDescription(event.target.value)}
                                        rows={3}
                                        placeholder="Resumo do ativo tokenizado"
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Propósito
                                        </label>
                                        <input
                                            value={tokenPurpose}
                                            onChange={(event) => setTokenPurpose(event.target.value)}
                                            placeholder="Ex: Tokenização de terreno residencial"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Geolocalização (opcional)
                                        </label>
                                        <input
                                            value={geolocation}
                                            onChange={(event) => setGeolocation(event.target.value)}
                                            placeholder="Ex: São Paulo - Brasil"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Referência legal (opcional)
                                        </label>
                                        <input
                                            value={legalReference}
                                            onChange={(event) => setLegalReference(event.target.value)}
                                            placeholder="Ex: Matrícula 0001-XYZ"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            URL externa (opcional)
                                        </label>
                                        <input
                                            value={externalUrl}
                                            onChange={(event) => setExternalUrl(event.target.value)}
                                            placeholder="https://seu-dominio.com/dados-do-projeto"
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                {/* Seção de Upload de Arquivos */}
                                <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                                    <div className="flex items-center gap-2">
                                        <Upload className="w-5 h-5 text-blue-500" />
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Documentos e Arquivos (opcional)
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Adicione documentos relacionados ao token (PDFs, imagens, etc.). Os arquivos serão associados quando o projeto for criado.
                                    </p>
                                    
                                    <div className="space-y-3">
                                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 dark:border-gray-700 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                <Upload className="w-8 h-8 mb-2 text-gray-500 dark:text-gray-400" />
                                                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                                    <span className="font-semibold">Clique para fazer upload</span> ou arraste e solte
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    PDF, DOC, DOCX, XLS, XLSX, imagens, etc. (máx. 50MB)
                                                </p>
                                            </div>
                                            <input
                                                type="file"
                                                className="hidden"
                                                multiple
                                                onChange={handleFileSelect}
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.jpg,.jpeg,.png,.gif,.txt,.csv,.json,.xml,.kml,.kmz"
                                            />
                                        </label>

                                        {selectedFiles.length > 0 && (
                                            <div className="space-y-2">
                                                {selectedFiles.map((file, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                                                    >
                                                        <File className="w-5 h-5 text-blue-500 mt-1 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                                {file.name}
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                {formatFileSize(file.size)} • {file.type || 'Tipo desconhecido'}
                                                            </p>
                                                            <input
                                                                type="text"
                                                                placeholder="Descrição do arquivo (opcional)"
                                                                value={fileDescriptions[file.name] || ''}
                                                                onChange={(e) => handleFileDescriptionChange(file.name, e.target.value)}
                                                                className="mt-2 w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveFile(index)}
                                                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                                                            aria-label="Remover arquivo"
                                                        >
                                                            <X className="w-4 h-4 text-red-500" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {issuanceError && (
                                    <div className="flex items-start gap-3 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300">
                                        <AlertCircle className="w-5 h-5 mt-1" />
                                        <p className="text-sm">{issuanceError}</p>
                                    </div>
                                )}

                                {issuanceSuccess && (
                                    <div className="flex flex-col gap-3 p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-xl text-green-700 dark:text-green-300">
                                        <div className="flex items-start gap-3">
                                            <Check className="w-5 h-5 mt-1" />
                                            <div className="text-sm space-y-1">
                                                <p className="font-semibold">{issuanceSuccess}</p>
                                                {txHash && (
                                                    <p>
                                                        Hash: <span className="font-mono break-all">{txHash}</span>
                                                    </p>
                                                )}
                                                {explorerUrl && (
                                                    <Link
                                                        href={explorerUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs underline"
                                                    >
                                                        Abrir no explorer <ArrowRight className="w-3 h-3" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Debug: Mostrar por que o botão está desabilitado */}
                                {(!isConnected || !selectedPreset || !tokenName.trim()) && (
                                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl">
                                        <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                                            ⚠️ Botão desabilitado - Verifique:
                                        </p>
                                        <ul className="text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                                            {!isConnected && (
                                                <li className="flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4" />
                                                    <span>Crossmark não conectada - Clique em &quot;Conectar Crossmark&quot; acima</span>
                                                </li>
                                            )}
                                            {!selectedPreset && (
                                                <li className="flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4" />
                                                    <span>Tipo de token não selecionado</span>
                                                </li>
                                            )}
                                            {!tokenName.trim() && (
                                                <li className="flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4" />
                                                    <span>Nome do token não preenchido</span>
                                                </li>
                                            )}
                                        </ul>
                                        <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-700">
                                            💡 <strong>Dica:</strong> Se você criou uma carteira ServiceWallet no banco, use a página{' '}
                                            <Link href="/admin/mpt" className="underline font-semibold">
                                                /admin/mpt
                                            </Link>
                                            {' '}ao invés desta.
                                        </p>
                                    </div>
                                )}

                                <button
                                    onClick={handleIssueToken}
                                    disabled={
                                        isIssuing ||
                                        !isConnected ||
                                        !selectedPreset ||
                                        !tokenName.trim()
                                    }
                                    className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isIssuing ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Emitindo...
                                        </>
                                    ) : (
                                        <>
                                            Emitir {selectedPreset?.label ?? 'Token'}
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.section>

                {/* Seção de MPTs Emitidos */}
                {isConnected && account && (
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="max-w-6xl mx-auto mt-12"
                    >
                        <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <Layers className="w-6 h-6" /> MPTs Emitidos
                                </h3>
                                <button
                                    onClick={loadIssuedTokens}
                                    disabled={loadingTokens}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loadingTokens ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Carregando...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" /> Atualizar
                                        </>
                                    )}
                                </button>
                            </div>

                            {loadingTokens ? (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                    <p>Carregando MPTs emitidos...</p>
                                </div>
                            ) : issuedTokens.length > 0 ? (
                                <div className="space-y-4">
                                    {issuedTokens.map((token, index) => (
                                        <div
                                            key={`${token.issuanceIdHex}-${index}`}
                                            className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                            ID: {token.issuanceIdHex.slice(0, 16)}...
                                                        </span>
                                                        {token.metadata?.name && (
                                                            <span className="font-semibold text-gray-800 dark:text-white">
                                                                {token.metadata.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {token.metadata?.description && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                            {token.metadata.description}
                                                        </p>
                                                    )}
                                                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                                                        <span>
                                                            Asset Scale: <strong>{token.assetScale}</strong>
                                                        </span>
                                                        <span>
                                                            Max Amount: <strong>{token.maximumAmount}</strong>
                                                        </span>
                                                        {token.issuedAt && (
                                                            <span>
                                                                Emitido em: <strong>{new Date(token.issuedAt).toLocaleDateString('pt-BR')}</strong>
                                                            </span>
                                                        )}
                                                    </div>
                                                    {token.flags && (
                                                        <div className="flex flex-wrap gap-2 mt-2">
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
                                                            {token.flags.canLock && (
                                                                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs">
                                                                    Pode Lock
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <Link
                                                        href={`${explorerByNetwork[account.network || 'testnet']}${token.txHash}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center gap-1"
                                                    >
                                                        Ver TX <ArrowRight className="w-3 h-3" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>Nenhum MPT emitido ainda</p>
                                    <p className="text-xs mt-1">Emita seu primeiro token usando o formulário acima</p>
                                </div>
                            )}
                        </div>
                    </motion.section>
                )}

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="max-w-5xl mx-auto mt-12"
                >
                    <div className="bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                        <div className="space-y-2">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                                Precisa de mais contexto?
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                Siga o blueprint completo descrito em Terra_fi.md para integrar LAND → COL e fluxos de
                                liquidez. Configure autorizações, freeze e clawback após a emissão inicial.
                            </p>
                        </div>
                        <Link
                            href="/"
                            className="px-5 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                        >
                            Voltar ao dashboard
                        </Link>
                    </div>
                </motion.section>
            </div>
        </main>
    );
}
