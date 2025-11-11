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
        const response = await client.request({
            command: 'account_lines',
            account,
            peer: issuer,
            ledger_index: 'validated',
        });
        return response.result;
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

    if (!isValidAddress(issuer)) {
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
        const response = await client.request({
            command: 'account_lines',
            account,
            peer: issuer,
            ledger_index: 'validated',
        });
        return response.result;
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

    if (!isValidAddress(account)) {
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

    if (!isValidAddress(account)) {
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
