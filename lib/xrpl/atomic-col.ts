/**
 * Atomicidade do COL (Collateral)
 * Saga pattern: freeze LAND → issue COL com compensação
 */

import { reliableSubmitV2 as reliableSubmit, generateIdempotencyKey } from './reliable-submission-v2';
import {
  buildMPTokenFreezeTransaction,
  buildMPTokenIssuanceTransaction,
} from '../crossmark/transactions';
import { Wallet } from 'xrpl';
import { xrplPool } from './pool';
import type { MPTokenMetadata } from '../crossmark/types';
import { getPrismaClient } from '../prisma';

export interface FreezeLANDParams {
  issuer: string;
  currency: string;
  holder: string;
  network: 'testnet' | 'mainnet' | 'devnet';
  issuerSeed?: string; // Seed do issuer para assinar transações
}

export interface IssueCOLParams {
  issuer: string;
  currency: string;
  amount: string;
  decimals: number;
  metadata?: MPTokenMetadata;
  network: 'testnet' | 'mainnet' | 'devnet';
  issuerSeed?: string; // Seed do issuer para assinar transações
}

export interface AtomicCOLResult {
  success: boolean;
  landFreezeTxHash?: string;
  colIssueTxHash?: string;
  error?: string;
  compensated: boolean;
}

/**
 * Saga para criar COL atomicamente: freeze LAND → issue COL
 * Se issue COL falhar, compensa unfreezing LAND
 */
export async function atomicCreateCOL(
  freezeParams: FreezeLANDParams,
  issueParams: IssueCOLParams,
  idempotencyKey?: string
): Promise<AtomicCOLResult> {
  const key = idempotencyKey || generateIdempotencyKey();
  const prisma = getPrismaClient();

  // Verifica se já existe operação com este idempotency key
  if (prisma) {
    const existing = await prisma.actionRecord.findFirst({
      where: {
        metadata: {
          path: ['idempotencyKey'],
          equals: key,
        },
      },
    });

    if (existing) {
      return {
        success: existing.type === 'freeze' && existing.txHash !== null,
        landFreezeTxHash: existing.txHash || undefined,
        compensated: false,
      };
    }
  }

  let landFreezeTxHash: string | null = null;
  let colIssueTxHash: string | null = null;

  try {
    // Passo 1: Freeze LAND
    const freezeTx = buildMPTokenFreezeTransaction({
      issuer: freezeParams.issuer,
      currency: freezeParams.currency,
      holder: freezeParams.holder,
      freeze: true,
    });

    // Assina transação antes de submeter
    if (!freezeParams.issuerSeed) {
      throw new Error('issuerSeed é obrigatório para assinar transações');
    }
    
    const issuer = Wallet.fromSeed(freezeParams.issuerSeed);
    const client = await xrplPool.getClient(freezeParams.network);
    const prepared = await client.autofill(freezeTx);
    const signed = issuer.sign(prepared);
    
    const freezeResult = await reliableSubmit(signed.tx_blob, freezeParams.network, {
      idempotencyKey: `${key}_freeze`,
      maxRetries: 3,
    });

    if (!freezeResult.success || !freezeResult.txHash) {
      return {
        success: false,
        error: `Failed to freeze LAND: ${freezeResult.error}`,
        compensated: false,
      };
    }

    landFreezeTxHash = freezeResult.txHash;

    // Registra freeze no banco
    if (prisma) {
      await prisma.actionRecord.create({
        data: {
          type: 'freeze',
          tokenCurrency: freezeParams.currency,
          tokenIssuer: freezeParams.issuer,
          actor: freezeParams.issuer,
          target: freezeParams.holder,
          network: freezeParams.network,
          txHash: landFreezeTxHash,
          metadata: {
            idempotencyKey: key,
            step: 'freeze_land',
          },
        },
      });
    }

    // Passo 2: Issue COL
    try {
      const issueTx = buildMPTokenIssuanceTransaction({
        issuer: issueParams.issuer,
        currency: issueParams.currency,
        amount: issueParams.amount,
        decimals: issueParams.decimals,
        transferable: false, // COL não é transferível
        metadata: issueParams.metadata,
      });

      // Assina transação antes de submeter
      if (!issueParams.issuerSeed) {
        throw new Error('issuerSeed é obrigatório para assinar transações');
      }
      
      const issuerWallet = Wallet.fromSeed(issueParams.issuerSeed);
      const issueClient = await xrplPool.getClient(issueParams.network);
      const issuePrepared = await issueClient.autofill(issueTx);
      const issueSigned = issuerWallet.sign(issuePrepared);

      const issueResult = await reliableSubmit(issueSigned.tx_blob, issueParams.network, {
        idempotencyKey: `${key}_issue`,
        maxRetries: 3,
      });

      if (!issueResult.success || !issueResult.txHash) {
        // Compensação: Unfreeze LAND
        await compensateUnfreezeLAND(freezeParams, landFreezeTxHash);

        return {
          success: false,
          landFreezeTxHash,
          error: `Failed to issue COL: ${issueResult.error}. LAND unfrozen as compensation.`,
          compensated: true,
        };
      }

      colIssueTxHash = issueResult.txHash;

      // Registra issue no banco
      if (prisma) {
        await prisma.actionRecord.create({
          data: {
            type: 'payout', // Usa 'payout' como tipo genérico para issue
            tokenCurrency: issueParams.currency,
            tokenIssuer: issueParams.issuer,
            actor: issueParams.issuer,
            network: issueParams.network,
            txHash: colIssueTxHash,
            metadata: {
              idempotencyKey: key,
              step: 'issue_col',
            },
          },
        });
      }

      return {
        success: true,
        landFreezeTxHash,
        colIssueTxHash,
        compensated: false,
      };
    } catch (issueError) {
      // Compensação: Unfreeze LAND
      await compensateUnfreezeLAND(freezeParams, landFreezeTxHash);

      return {
        success: false,
        landFreezeTxHash,
        error: `Failed to issue COL: ${issueError instanceof Error ? issueError.message : String(issueError)}. LAND unfrozen as compensation.`,
        compensated: true,
      };
    }
  } catch (error) {
    // Se freeze falhou, não precisa compensar
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      compensated: false,
    };
  }
}

/**
 * Compensação: Unfreeze LAND
 */
async function compensateUnfreezeLAND(
  freezeParams: FreezeLANDParams,
  freezeTxHash: string
): Promise<void> {
  try {
    if (!freezeParams.issuerSeed) {
      console.error('[AtomicCOL] issuerSeed não fornecido, não é possível compensar unfreeze');
      return;
    }

    const unfreezeTx = buildMPTokenFreezeTransaction({
      issuer: freezeParams.issuer,
      currency: freezeParams.currency,
      holder: freezeParams.holder,
      freeze: false,
    });

    // Assina transação antes de submeter
    const issuerWallet = Wallet.fromSeed(freezeParams.issuerSeed!);
    const client = await xrplPool.getClient(freezeParams.network);
    const prepared = await client.autofill(unfreezeTx);
    const signed = issuerWallet.sign(prepared);

    const result = await reliableSubmit(signed.tx_blob, freezeParams.network, {
      idempotencyKey: `compensate_${freezeTxHash}`,
      maxRetries: 3,
    });

    if (result.success && result.txHash) {
      const prisma = getPrismaClient();
      if (prisma) {
        await prisma.actionRecord.create({
          data: {
            type: 'freeze',
            tokenCurrency: freezeParams.currency,
            tokenIssuer: freezeParams.issuer,
            actor: freezeParams.issuer,
            target: freezeParams.holder,
            network: freezeParams.network,
            txHash: result.txHash,
            metadata: {
              compensation: true,
              originalFreezeTxHash: freezeTxHash,
            },
          },
        });
      }
    }
  } catch (error) {
    // Log erro de compensação mas não falha a operação principal
    console.error('[AtomicCOL] Failed to compensate unfreeze:', error);
  }
}
