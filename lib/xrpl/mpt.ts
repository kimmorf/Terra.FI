import { isValidXRPLAddress } from './validation';
import { xrplPool, type XRPLNetwork } from './pool';
import { withXRPLRetry } from '../utils/retry';
import { cache } from '../utils/cache';

export async function hasTrustLine(params: {
    account: string;
    currency: string;
    issuer: string;
    network?: string;
}) {
    const { account, currency, issuer, network = 'testnet' } = params;

    if (!isValidXRPLAddress(account) || !isValidXRPLAddress(issuer)) {
        throw new Error('Endereço XRPL inválido');
    }

    const cacheKey = `trustline:${network}:${account}:${currency}:${issuer}`;
    const cached = cache.get<boolean>(cacheKey);
    if (cached !== null) {
        return cached;
    }

    const result = await withXRPLRetry(async () => {
        const client = await xrplPool.getClient(network as XRPLNetwork);
        try {
            const response = await client.request({
                command: 'account_lines',
                account,
                peer: issuer,
                ledger_index: 'validated',
            });
            return response.result;
        } catch (error: any) {
            // Tratar erro "Account malformed" especificamente
            if (error?.message?.includes('Account malformed') || 
                error?.message?.includes('actNotFound') ||
                error?.name === 'RippledError') {
                // Retornar resultado vazio ao invés de lançar erro
                return { lines: [] };
            }
            throw error;
        }
    }, { maxAttempts: 3 });

    const hasTrustLine = (result.lines ?? []).some(
        (line: any) => line.currency?.toUpperCase() === currency.toUpperCase() && line.account === issuer
    );

    // Cachear por 10 segundos
    cache.set(cacheKey, hasTrustLine, 10000);

    return hasTrustLine;
}

export async function getTokenHolders(params: {
    issuer: string;
    currency: string;
    network?: string;
}) {
    const { issuer, currency, network = 'testnet' } = params;

    if (!isValidXRPLAddress(issuer)) {
        throw new Error('Endereço XRPL inválido');
    }

    const cacheKey = `token_holders:${network}:${issuer}:${currency}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const result = await withXRPLRetry(async () => {
        const client = await xrplPool.getClient(network as XRPLNetwork);
        const response = await client.request({
            command: 'account_lines',
            account: issuer,
            ledger_index: 'validated',
        });
        return response.result;
    }, { maxAttempts: 3 });

    const holders = (result.lines ?? []).filter(
        (line: any) => line.currency?.toUpperCase() === currency.toUpperCase()
    );

    // Cachear por 10 segundos
    cache.set(cacheKey, holders, 10000);

    return holders;
}

export function calculateTotalSupply(lines: any[]): number {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((acc, line) => acc + Number(line.balance ?? 0), 0);
}

export async function getAccountBalance(params: {
    account: string;
    currency: string;
    issuer: string;
    network?: string;
}) {
    const { account, currency, issuer, network = 'testnet' } = params;

    if (!isValidXRPLAddress(account) || !isValidXRPLAddress(issuer)) {
        throw new Error('Endereço XRPL inválido');
    }

    const cacheKey = `account_balance:${network}:${account}:${currency}:${issuer}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== null) {
        return cached;
    }

    const result = await withXRPLRetry(async () => {
        const client = await xrplPool.getClient(network as XRPLNetwork);
        try {
            const response = await client.request({
                command: 'account_lines',
                account,
                peer: issuer,
                ledger_index: 'validated',
            });
            return response.result;
        } catch (error: any) {
            // Tratar erro "Account malformed" especificamente
            if (error?.message?.includes('Account malformed') || 
                error?.message?.includes('actNotFound') ||
                error?.name === 'RippledError') {
                // Retornar resultado vazio ao invés de lançar erro
                return { lines: [] };
            }
            throw error;
        }
    }, { maxAttempts: 3 });

    const line = (result.lines ?? []).find(
        (entry: any) => entry.currency?.toUpperCase() === currency.toUpperCase() && entry.account === issuer
    );

    const balance = line?.balance ?? '0';

    // Cachear por 5 segundos
    cache.set(cacheKey, balance, 5000);

    return balance;
}

export async function getAccountLines(params: { account: string; network?: string }) {
    const { account, network = 'testnet' } = params;

    if (!isValidXRPLAddress(account)) {
        throw new Error('Endereço XRPL inválido');
    }

    const cacheKey = `account_lines:${network}:${account}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const result = await withXRPLRetry(async () => {
        const client = await xrplPool.getClient(network as XRPLNetwork);
        const response = await client.request({
            command: 'account_lines',
            account,
            ledger_index: 'validated',
        });
        return response.result;
    }, { maxAttempts: 3 });

    const lines = result.lines ?? [];

    // Cachear por 10 segundos
    cache.set(cacheKey, lines, 10000);

    return lines;
}

export async function getAccountTransactions(params: {
    account: string;
    network?: string;
    limit?: number;
}) {
    const { account, network = 'testnet', limit = 20 } = params;

    if (!isValidXRPLAddress(account)) {
        throw new Error('Endereço XRPL inválido');
    }

    // Não cachear transações (sempre buscar dados atualizados)
    const result = await withXRPLRetry(async () => {
        const client = await xrplPool.getClient(network as XRPLNetwork);
        const response = await client.request({
            command: 'account_tx',
            account,
            ledger_index_min: -1,
            ledger_index_max: -1,
            limit,
            binary: false,
        });
        return response.result;
    }, { maxAttempts: 3 });

    return result.transactions ?? [];
}

/**
 * Lista todos os MPTs emitidos por uma conta
 * Usa account_objects para buscar objetos MPTokenIssuance
 */
export async function getIssuedMPTokens(params: {
    issuer: string;
    network?: string;
}) {
    const { issuer, network = 'testnet' } = params;

    if (!isValidXRPLAddress(issuer)) {
        throw new Error('Endereço XRPL inválido');
    }

    const cacheKey = `issued_mpt:${network}:${issuer}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const result = await withXRPLRetry(async () => {
        let client;
        try {
            client = await xrplPool.getClient(network as XRPLNetwork);
            
            // Verificar se está conectado e fazer uma requisição leve para validar
            if (!client.isConnected()) {
                try {
                    await client.connect();
                } catch (connectError) {
                    console.error('[getIssuedMPTokens] Erro ao conectar client:', connectError);
                    // Forçar criação de nova conexão removendo do pool
                    throw new Error(`Conexão XRPL não disponível: ${connectError instanceof Error ? connectError.message : 'websocket foi fechado'}`);
                }
            }
            
            // Fazer uma requisição leve para validar a conexão
            try {
                await client.request({ command: 'ping' });
            } catch (pingError: any) {
                // Se ping falhar, a conexão está morta
                console.error('[getIssuedMPTokens] Erro ao fazer ping:', pingError);
                // Desconectar e forçar nova conexão
                try {
                    await client.disconnect();
                } catch {
                    // Ignora erro ao desconectar
                }
                throw new Error('Conexão com a rede XRPL foi fechada. Tente novamente.');
            }
        } catch (connectionError: any) {
            console.error('[getIssuedMPTokens] Erro ao fazer requisição:', connectionError);
            throw new Error(connectionError.message || 'Conexão com a rede XRPL foi fechada. Tente novamente.');
        }
        
        try {
            // Buscar objetos MPTokenIssuance emitidos por esta conta
            // Nota: account_objects não suporta filtro por tipo para MPTokenIssuance diretamente
            // Vamos buscar todos os objetos e filtrar
            const response = await client.request({
                command: 'account_objects',
                account: issuer,
                ledger_index: 'validated',
                limit: 400, // Limite máximo
            });

        const allObjects = response.result.account_objects ?? [];
        
        // Filtrar apenas objetos do tipo MPTokenIssuance
        const mptObjects = allObjects.filter((obj: any) => 
            obj.LedgerEntryType === 'MPTokenIssuance'
        );
        
        // Para cada objeto, buscar detalhes completos via account_tx para obter metadados
        const mptIssuances = await Promise.all(
            mptObjects.map(async (obj: any) => {
                try {
                    // Buscar transação original para obter metadados
                    const txResponse = await client.request({
                        command: 'tx',
                        transaction: obj.PreviousTxnID,
                        binary: false,
                    });

                    const tx = txResponse.result;
                    const txJson = tx.Transaction || tx;
                    const meta = tx.meta || tx.MetaData;

                    // Extrair MPTokenIssuanceID do meta
                    let issuanceIdHex: string | undefined;
                    if (meta) {
                        // Tentar extrair do meta diretamente
                        issuanceIdHex = (meta as any)?.MPTokenIssuanceID;
                        
                        // Se não encontrou, buscar em AffectedNodes
                        if (!issuanceIdHex && (meta as any)?.AffectedNodes) {
                            for (const node of (meta as any).AffectedNodes || []) {
                                if (node.CreatedNode?.LedgerEntryType === 'MPTokenIssuance') {
                                    issuanceIdHex = node.CreatedNode?.NewFields?.MPTokenIssuanceID;
                                    break;
                                }
                            }
                        }
                    }

                    // Extrair metadados do MPTokenMetadata
                    let metadata: any = null;
                    if (txJson.MPTokenMetadata) {
                        try {
                            const metadataHex = txJson.MPTokenMetadata;
                            const metadataBuffer = Buffer.from(metadataHex, 'hex');
                            metadata = JSON.parse(metadataBuffer.toString('utf-8'));
                        } catch (e) {
                            console.warn('[getIssuedMPTokens] Erro ao parsear metadados:', e);
                        }
                    }

                    // Extrair flags
                    const flags = txJson.Flags || 0;
                    const flagsObj = {
                        canLock: (flags & 0x00000002) !== 0,
                        requireAuth: (flags & 0x00000004) !== 0,
                        canEscrow: (flags & 0x00000008) !== 0,
                        canTrade: (flags & 0x00000010) !== 0,
                        canTransfer: (flags & 0x00000020) !== 0,
                        canClawback: (flags & 0x00000040) !== 0,
                    };

                    return {
                        issuanceIdHex: issuanceIdHex || obj.index,
                        txHash: obj.PreviousTxnID,
                        ledgerIndex: obj.LedgerIndex,
                        assetScale: txJson.AssetScale ?? 0,
                        maximumAmount: txJson.MaximumAmount ?? '0',
                        transferFee: txJson.TransferFee ?? 0,
                        flags: flagsObj,
                        metadata,
                        issuedAt: tx.date ? new Date((tx.date + 946684800) * 1000).toISOString() : undefined,
                    };
                } catch (error) {
                    console.warn(`[getIssuedMPTokens] Erro ao processar objeto ${obj.index}:`, error);
                    // Retornar dados básicos mesmo se falhar ao buscar detalhes
                    return {
                        issuanceIdHex: obj.index,
                        txHash: obj.PreviousTxnID,
                        ledgerIndex: obj.LedgerIndex,
                        assetScale: 0,
                        maximumAmount: '0',
                        transferFee: 0,
                        flags: {},
                        metadata: null,
                    };
                }
            })
        );

        return mptIssuances;
        } catch (requestError: any) {
            console.error('[getIssuedMPTokens] Erro ao fazer requisição:', requestError);
            // Se o erro é de websocket fechado, relançar com mensagem mais clara
            if (requestError.message?.includes('websocket') || requestError.message?.includes('closed')) {
                throw new Error(`Conexão com a rede XRPL foi fechada. Tente novamente.`);
            }
            throw requestError;
        }
    }, { maxAttempts: 3 });

    // Cachear por 30 segundos
    cache.set(cacheKey, result, 30000);

    return result;
}
