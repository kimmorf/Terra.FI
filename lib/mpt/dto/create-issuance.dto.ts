import { z } from 'zod';

export const CreateIssuanceSchema = z.object({
  type: z.enum(['LAND', 'BUILD', 'REV', 'COL']),
  name: z.string().min(1),
  symbol: z.string().min(1),
  maximumAmount: z.string().regex(/^[0-9]+$/).default('0'),
  decimals: z.number().int().min(0).max(9).default(0),
  assetScale: z.number().int().min(0).max(9).default(0),
  transferFee: z.number().int().min(0).max(50000).default(0),
  
  // Wallets
  issuerWalletId: z.string().uuid(),
  distributionWalletId: z.string().uuid().optional(),
  createDistributionWalletIfMissing: z.boolean().default(true),
  
  // Metadata
  metadata: z.record(z.string(), z.any()).optional(),
  
  // Flags
  flags: z
    .object({
      requireAuth: z.boolean().optional(),
      canFreeze: z.boolean().optional(),
      canClawback: z.boolean().optional(),
      canTransfer: z.boolean().optional(),
      canTrade: z.boolean().optional(),
      canLock: z.boolean().optional(),
      canEscrow: z.boolean().optional(),
    })
    .default({}),
  
  network: z.enum(['testnet', 'mainnet', 'devnet']).default('testnet'),
});

export type CreateIssuanceDto = z.infer<typeof CreateIssuanceSchema>;

