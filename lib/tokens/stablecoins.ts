export interface StablecoinConfig {
    id: string;
    label: string;
    currency: string;
    issuer: string;
    network: 'testnet' | 'devnet' | 'mainnet';
    description: string;
    decimals: number;
}

export const STABLECOINS: StablecoinConfig[] = [
    {
        id: 'RLUSD_TEST',
        label: 'RLUSD (Testnet)',
        currency: 'RLUSD',
        issuer: 'rHLEki8gPUMnF72JQJ3fr83QgZ2GeETz9b',
        network: 'testnet',
        description: 'Stablecoin RLUSD disponibilizada na XRPL Testnet.',
        decimals: 6,
    },
    {
        id: 'USD_TEST',
        label: 'USD (Devnet)',
        currency: 'USD',
        issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        network: 'devnet',
        description: 'USD sintético para operações na Devnet.',
        decimals: 2,
    },
];

export function findStablecoin(id: string) {
    return STABLECOINS.find((coin) => coin.id === id);
}
