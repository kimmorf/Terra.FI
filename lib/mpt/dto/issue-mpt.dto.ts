import { z } from 'zod';

export const IssueMPTSchema = z.object({
  assetScale: z.number().int().min(0).max(9).default(0),
  maximumAmount: z.string().regex(/^[0-9]+$/).default('0'), // 0 = sem cap explícito
  transferFee: z.number().int().min(0).max(50000).default(0), // bps
  metadataJSON: z.record(z.string(), z.any()).optional(), // XLS-89 (minimizar; grandes via hash/uri)
  flags: z
    .object({
      canLock: z.boolean().optional(),
      requireAuth: z.boolean().optional(),
      canEscrow: z.boolean().optional(),
      canTrade: z.boolean().optional(),
      canTransfer: z.boolean().optional(),
      canClawback: z.boolean().optional(),
    })
    .default({}),
});

export type IssueMPTDto = z.infer<typeof IssueMPTSchema>;
