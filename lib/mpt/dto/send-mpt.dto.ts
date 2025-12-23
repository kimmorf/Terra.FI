import { z } from 'zod';

export const SendMPTSchema = z.object({
  mptIssuanceIdHex: z.string().regex(/^[A-F0-9]{48,64}$/i),
  amount: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
  destination: z.string().startsWith('r'),
  txBlob: z.string().optional(), // opcional: se front assinar (Crossmark)
});

export type SendMPTDto = z.infer<typeof SendMPTSchema>;
