import { z } from 'zod';

/**
 * DTO para solicitar cotação de compra
 */
export const QuotePurchaseSchema = z.object({
  issuanceIdHex: z.string().regex(/^[A-F0-9]{64}$/i),
  quantity: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
  currency: z.enum(['XRP', 'RLUSD']),
  network: z.enum(['testnet', 'mainnet', 'devnet']).optional().default('testnet'),
});

export type QuotePurchaseDto = z.infer<typeof QuotePurchaseSchema>;

/**
 * DTO para commit de compra
 */
export const CommitPurchaseSchema = z.object({
  quoteId: z.string().optional(), // ID da cotação (se usar sistema de quotes)
  issuanceIdHex: z.string().regex(/^[A-F0-9]{64}$/i),
  quantity: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
  quotedPrice: z.string().regex(/^[0-9]+(\.[0-9]+)?$/),
  currency: z.enum(['XRP', 'RLUSD']),
  buyerAddress: z.string().startsWith('r'),
  purchaseId: z.string().optional(), // ID externo para idempotência
  network: z.enum(['testnet', 'mainnet', 'devnet']).optional().default('testnet'),
});

export type CommitPurchaseDto = z.infer<typeof CommitPurchaseSchema>;

/**
 * DTO para confirmar pagamento
 */
export const ConfirmPurchaseSchema = z.object({
  purchaseId: z.string(),
  paymentTxHash: z.string().optional(), // Se frontend enviar hash
  network: z.enum(['testnet', 'mainnet', 'devnet']).optional().default('testnet'),
});

export type ConfirmPurchaseDto = z.infer<typeof ConfirmPurchaseSchema>;
