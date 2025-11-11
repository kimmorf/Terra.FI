import { Client } from 'xrpl';

const XRPL_ENDPOINTS: Record<string, string> = {
    mainnet: 'wss://xrplcluster.com',
    testnet: 'wss://s.altnet.rippletest.net:51233',
    devnet: 'wss://s.devnet.rippletest.net:51233',
};

function resolveEndpoint(network: string | undefined) {
    return XRPL_ENDPOINTS[network ?? 'testnet'] ?? XRPL_ENDPOINTS.testnet;
}

async function withClient<T>(network: string | undefined, handler: (client: Client) => Promise<T>) {
    const client = new Client(resolveEndpoint(network));

    try {
        await client.connect();
        const result = await handler(client);
        await client.disconnect();
        return result;
    } catch (error) {
        await client.disconnect();
        throw error;
    }
}

export async function hasTrustLine(params: {
    account: string;
    currency: string;
    issuer: string;
    network?: string;
}) {
    const { account, currency, issuer, network } = params;

    const result = await withClient(network, (client) =>
        client.request({
            command: 'account_lines',
            account,
            peer: issuer,
            ledger_index: 'validated',
        }),
    );

    return (
        result.result.lines ?? []
    ).some((line: any) => line.currency?.toUpperCase() === currency.toUpperCase() && line.account === issuer);
}

export async function getTokenHolders(params: {
    issuer: string;
    currency: string;
    network?: string;
}) {
    const { issuer, currency, network } = params;

    const result = await withClient(network, (client) =>
        client.request({
            command: 'account_lines',
            account: issuer,
            ledger_index: 'validated',
        }),
    );

    return (result.result.lines ?? []).filter(
        (line: any) => line.currency?.toUpperCase() === currency.toUpperCase(),
    );
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
    const { account, currency, issuer, network } = params;

    const result = await withClient(network, (client) =>
        client.request({
            command: 'account_lines',
            account,
            peer: issuer,
            ledger_index: 'validated',
        }),
    );

    const line = (result.result.lines ?? []).find(
        (entry: any) => entry.currency?.toUpperCase() === currency.toUpperCase() && entry.account === issuer,
    );

    return line?.balance ?? '0';
}

export async function getAccountLines(params: { account: string; network?: string }) {
    const { account, network } = params;

    const result = await withClient(network, (client) =>
        client.request({
            command: 'account_lines',
            account,
            ledger_index: 'validated',
        }),
    );

    return result.result.lines ?? [];
}

export async function getAccountTransactions(params: {
    account: string;
    network?: string;
    limit?: number;
}) {
    const { account, network, limit = 20 } = params;

    const result = await withClient(network, (client) =>
        client.request({
            command: 'account_tx',
            account,
            ledger_index_min: -1,
            ledger_index_max: -1,
            limit,
            binary: false,
        }),
    );

    return result.result.transactions ?? [];
}
