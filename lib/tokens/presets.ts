import type { MPTokenMetadata } from '@/lib/crossmark/types';

export interface TokenPreset {
    id: 'LAND' | 'BUILD' | 'REV' | 'COL';
    label: string;
    currency: string;
    summary: string;
    description: string;
    metadata: MPTokenMetadata;
    decimals: number;
    transferable: boolean;
    defaultSupply: string;
    highlights: string[];
    docs?: string;
    issuerAddress?: string;
}

export const TOKEN_CONFIG: Record<string, { decimals: number; transferable: boolean }> = {
    LAND: { decimals: 2, transferable: true },
    BUILD: { decimals: 2, transferable: true },
    REV: { decimals: 2, transferable: true },
    COL: { decimals: 0, transferable: false },
};

export const TOKEN_PRESETS: TokenPreset[] = [
    {
        id: 'LAND',
        label: 'LAND-MPT',
        currency: 'LAND',
        summary: 'Tokenização de parcelas de terra com base em XRPL',
        description:
            'LAND-MPT representa frações de um terreno físico, permitindo distribuição e comercialização ágil sem comprometer o controle do ativo imobiliário.',
        metadata: {
            name: 'LAND-MPT',
            description: 'Tokenização de terrenos fracionados (1 token = 1 m²)',
            purpose: 'Emitir parcelas certificadas de terrenos dentro do protocolo Terra.FI',
            geolocation: 'LATAM',
            legalReference: 'Registro de Imóveis / Matrícula 0001-XYZ',
            externalUrl: 'https://xrpl.org/docs/tutorials/how-tos/use-tokens',
        },
        decimals: 2,
        transferable: true,
        defaultSupply: '100000',
        highlights: [
            '1 token = 1 m² tokenizado',
            'Permite captação inicial para desenvolvimento imobiliário',
            'Compatível com metadados XLS-89 para registro público',
        ],
        issuerAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    },
    {
        id: 'BUILD',
        label: 'BUILD-MPT',
        currency: 'BUILD',
        summary: 'Financiamento de CAPEX para construção',
        description:
            'BUILD-MPT representa tranches de financiamento de construção. Pode ser emitido por etapa, liberando capital conforme o cronograma físico-financeiro.',
        metadata: {
            name: 'BUILD-MPT',
            description: 'Tranches de CAPEX vinculadas ao progresso da obra',
            purpose: 'Controlar liberações de capital para construção',
            legalReference: 'Contrato de Construção / Etapa 1',
            externalUrl: 'https://xrpl.org/docs/tutorials/how-tos/use-specialized-payment-types',
        },
        decimals: 2,
        transferable: true,
        defaultSupply: '50000',
        highlights: [
            'Liberações vinculadas a marcos físicos',
            'Permite tokenizar dívidas de construção',
            'Pode ser convertido em REV-MPT após entrega',
        ],
        issuerAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    },
    {
        id: 'REV',
        label: 'REV-MPT',
        currency: 'REV',
        summary: 'Participação em receitas recorrentes (aluguéis ou fluxo de caixa)',
        description:
            'REV-MPT representa direitos de receita (aluguel, venda ou distribuição de lucros) ancorados no ativo tokenizado. Ideal para pools de rendimento.',
        metadata: {
            name: 'REV-MPT',
            description: 'Tokens vinculados à receita recorrente do ativo',
            purpose: 'Distribuir receitas do ativo tokenizado entre investidores',
            legalReference: 'Contrato de Distribuição de Receitas / DOC-REV-2025',
            externalUrl: 'https://xrpl.org/docs/tutorials/how-tos/send-xrp',
        },
        decimals: 2,
        transferable: true,
        defaultSupply: '25000',
        highlights: [
            'Distribuição de receitas tokenizada',
            'Integra com pools de liquidez no XRPL DEX',
            'Compatível com staking e reinvestimento automático',
        ],
        issuerAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    },
    {
        id: 'COL',
        label: 'COL-MPT',
        currency: 'COL',
        summary: 'Token de colateralização derivado de LAND-MPT congelado',
        description:
            'COL-MPT é emitido quando LAND-MPT é travado como colateral. Serve como representação de crédito para acessar linhas de liquidez baseadas em ativos reais.',
        metadata: {
            name: 'COL-MPT',
            description: 'Representação de colateral para acesso a crédito',
            purpose: 'Permitir linhas de crédito contra LAND-MPT tokenizado',
            legalReference: 'Instrumento de Colateralização / COL-2025-001',
            externalUrl: 'https://xrpl.org/docs/tutorials/how-tos/manage-account-settings',
        },
        decimals: 0,
        transferable: false,
        defaultSupply: '1000',
        highlights: [
            'Congelamento automático de LAND-MPT vinculado',
            'Emissão não-transferível (Transferable = false)',
            'Suporte a callbacks de desenlace para liquidação',
        ],
        issuerAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    },
];
