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

export async function registerIssuance(payload: RegisterIssuancePayload) {
    const baseUrl = DEFAULT_BASE_URL.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/issuances`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(
            `Erro ao registrar emissão no Elysia: ${response.status} ${response.statusText} - ${message}`,
        );
    }

    return response.json();
}
