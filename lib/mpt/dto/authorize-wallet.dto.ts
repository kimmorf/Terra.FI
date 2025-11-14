import { z } from 'zod';

export const AuthorizeWalletSchema = z.object({
  walletType: z.enum(['crossmark', 'internal']),
  walletId: z.string().uuid().optional(), // Para walletType = "internal"
  address: z.string().startsWith('r').optional(), // Para walletType = "crossmark"
});

export type AuthorizeWalletDto = z.infer<typeof AuthorizeWalletSchema>;

