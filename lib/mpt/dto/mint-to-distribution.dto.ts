import { z } from 'zod';

export const MintToDistributionSchema = z.object({
  amount: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
});

export type MintToDistributionDto = z.infer<typeof MintToDistributionSchema>;

