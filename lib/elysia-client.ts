const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_ELYSIA_URL || 'http://localhost:3001';

interface RegisterIssuancePayload {
    projectId: string;
    projectName: string;
    tokenType: string;
    currency: string;
    amount: string;
    decimals: number;
    issuer: string;
    network: string;
    txHash: string;
    metadata?: Record<string, unknown>;
    rawResponse?: unknown;
}

interface RegisterActionPayload {
    type: 'authorize' | 'payment' | 'freeze' | 'clawback' | 'payout' | 'error' | 'trustset' | 'dex_offer';
    token: 
        | { currency: string; issuer: string; mptokenIssuanceID?: never }
        | { mptokenIssuanceID: string; currency?: never; issuer?: never };
    actor: string;
    target?: string;
    amount?: string;
    network: string;
    txHash: string;
    metadata?: Record<string, unknown>;
}

async function postToElysia(path: string, payload: unknown) {
    const baseUrl = DEFAULT_BASE_URL.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(
            `Erro ao comunicar com Elysia (${path}): ${response.status} ${response.statusText} - ${message}`,
        );
    }

    return response.json();
}

export function registerIssuance(payload: RegisterIssuancePayload) {
    return postToElysia('/api/issuances', payload);
}

export function registerAction(payload: RegisterActionPayload) {
    return postToElysia('/api/actions', payload);
}
