import { z } from 'zod';

export const AuthorizeMPTSchema = z.object({
  holderAddress: z.string().startsWith('r'),
  issuanceIdHex: z.string().regex(/^[A-F0-9]{64}$/i),
  unauthorize: z.boolean().optional(),
});

export type AuthorizeMPTDto = z.infer<typeof AuthorizeMPTSchema>;
