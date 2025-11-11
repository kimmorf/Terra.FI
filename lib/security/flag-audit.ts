/**
 * Sistema de auditoria de flags (Freeze/Clawback/Authorize)
 * 
 * Registra quem executou operações sensíveis e valida permissões.
 */

import { getPrismaServerClient } from '../prisma-server';
import { 
  getRegularKeyStatus, 
  validateIssuerWallet, 
  IssuerOperation
} from '../xrpl/regular-key';
import type { XRPLNetwork } from '../xrpl/pool';
import { isValidAddress } from 'xrpl';

const prisma = getPrismaServerClient();

export type FlagOperation = 'freeze' | 'clawback' | 'authorize';

export interface FlagAuditParams {
  operation: FlagOperation;
  tokenCurrency: string;
  tokenIssuer: string;
  executor: string; // Wallet que executou
  target?: string; // Wallet alvo (holder)
  amount?: string;
  network: XRPLNetwork;
  txHash: string;
  sourceIP?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresColdWallet: boolean;
  isColdWallet: boolean;
  isHotWallet: boolean;
  regularKeyConfigured: boolean;
}

/**
 * Verifica permissões para executar operação de flag
 */
export async function checkFlagPermission(
  operation: FlagOperation,
  issuer: string,
  executor: string,
  network: XRPLNetwork
): Promise<PermissionCheckResult> {
  if (!isValidAddress(issuer) || !isValidAddress(executor)) {
    return {
      allowed: false,
      reason: 'Endereço inválido',
      requiresColdWallet: true,
      isColdWallet: false,
      isHotWallet: false,
      regularKeyConfigured: false,
    };
  }

  // Busca configuração de permissões
  const permission = await prisma?.issuerPermission.findUnique({
    where: {
      issuer_network: {
        issuer,
        network,
      },
    },
  });

  // Se não tem configuração, usa padrões conservadores
  if (!permission) {
    // Padrão: apenas cold wallet pode executar freeze/clawback
    const requiresColdWallet = operation === 'freeze' || operation === 'clawback';
    const isColdWallet = issuer === executor;

    if (requiresColdWallet && !isColdWallet) {
      return {
        allowed: false,
        reason: `${operation} requer wallet cold (issuer principal)`,
        requiresColdWallet: true,
        isColdWallet: false,
        isHotWallet: false,
        regularKeyConfigured: false,
      };
    }

    return {
      allowed: true,
      requiresColdWallet,
      isColdWallet,
      isHotWallet: false,
      regularKeyConfigured: false,
    };
  }

  // Verifica se operação está permitida
  const operationAllowed = 
    (operation === 'freeze' && permission.canFreeze) ||
    (operation === 'clawback' && permission.canClawback) ||
    (operation === 'authorize' && permission.canAuthorize);

  if (!operationAllowed) {
    return {
      allowed: false,
      reason: `Operação ${operation} não está habilitada para este issuer`,
      requiresColdWallet: operation === 'freeze' || operation === 'clawback',
      isColdWallet: false,
      isHotWallet: false,
      regularKeyConfigured: !!permission.regularKey,
    };
  }

  // Verifica se executor é a wallet cold
  const isColdWallet = permission.coldWallet === executor;

  // Verifica se executor é a RegularKey (hot wallet)
  const regularKeyStatus = await getRegularKeyStatus(issuer, network);
  const isHotWallet = regularKeyStatus.isConfigured && 
                      regularKeyStatus.regularKey === executor;

  // Verifica se executor está na lista de wallets autorizadas
  const isAuthorizedWallet = permission.authorizedWallets.includes(executor);

  // Regras de permissão
  let allowed = false;
  let reason: string | undefined;

  if (isColdWallet) {
    // Cold wallet sempre pode executar
    allowed = true;
  } else if (isHotWallet) {
    // Hot wallet (RegularKey) pode executar apenas authorize
    if (operation === 'authorize') {
      allowed = true;
    } else {
      allowed = false;
      reason = `${operation} requer wallet cold, não pode ser executado por RegularKey`;
    }
  } else if (isAuthorizedWallet) {
    // Wallet autorizada pode executar apenas authorize
    if (operation === 'authorize') {
      allowed = true;
    } else {
      allowed = false;
      reason = `${operation} requer wallet cold ou RegularKey`;
    }
  } else {
    allowed = false;
    reason = 'Executor não está autorizado (não é cold wallet, RegularKey ou wallet autorizada)';
  }

  // Verifica requisitos específicos
  if (operation === 'freeze' && permission.requireColdWalletForFreeze && !isColdWallet) {
    allowed = false;
    reason = 'Freeze requer wallet cold conforme configuração';
  }

  if (operation === 'clawback' && permission.requireColdWalletForClawback && !isColdWallet) {
    allowed = false;
    reason = 'Clawback requer wallet cold conforme configuração';
  }

  return {
    allowed,
    reason,
    requiresColdWallet: operation === 'freeze' || operation === 'clawback',
    isColdWallet,
    isHotWallet,
    regularKeyConfigured: regularKeyStatus.isConfigured,
  };
}

/**
 * Registra auditoria de operação de flag
 */
export async function auditFlagOperation(
  params: FlagAuditParams
): Promise<void> {
  if (!prisma) {
    console.error('[FlagAudit] Prisma não disponível');
    return;
  }

  const {
    operation,
    tokenCurrency,
    tokenIssuer,
    executor,
    target,
    amount,
    network,
    txHash,
    sourceIP,
    userAgent,
    metadata = {},
  } = params;

  // Verifica permissões
  const permissionCheck = await checkFlagPermission(
    operation,
    tokenIssuer,
    executor,
    network
  );

  // Obtém status da RegularKey
  const regularKeyStatus = await getRegularKeyStatus(tokenIssuer, network);

  // Busca configuração de permissões
  const permission = await prisma.issuerPermission.findUnique({
    where: {
      issuer_network: {
        issuer: tokenIssuer,
        network,
      },
    },
  });

  // Registra auditoria
  await prisma.flagAudit.create({
    data: {
      operation,
      tokenCurrency,
      tokenIssuer,
      executor,
      target: target || null,
      amount: amount || null,
      network,
      txHash,
      sourceIP: sourceIP || null,
      userAgent: userAgent || null,
      regularKeyUsed: permissionCheck.isHotWallet,
      coldWallet: permission?.coldWallet || tokenIssuer,
      hotWallet: regularKeyStatus.regularKey || null,
      hadPermission: permissionCheck.allowed,
      permissionReason: permissionCheck.reason || null,
      metadata: {
        ...metadata,
        permissionCheck: {
          allowed: permissionCheck.allowed,
          requiresColdWallet: permissionCheck.requiresColdWallet,
          isColdWallet: permissionCheck.isColdWallet,
          isHotWallet: permissionCheck.isHotWallet,
          regularKeyConfigured: permissionCheck.regularKeyConfigured,
        },
      },
    },
  });
}

/**
 * Obtém histórico de auditoria de flags
 */
export async function getFlagAuditHistory(
  issuer?: string,
  operation?: FlagOperation,
  limit: number = 100
) {
  if (!prisma) {
    return [];
  }

  const where: any = {};
  if (issuer) where.tokenIssuer = issuer;
  if (operation) where.operation = operation;

  return prisma.flagAudit.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Cria ou atualiza configuração de permissões para um issuer
 */
export async function setIssuerPermissions(
  issuer: string,
  network: XRPLNetwork,
  config: {
    canFreeze?: boolean;
    canClawback?: boolean;
    canAuthorize?: boolean;
    authorizedWallets?: string[];
    regularKey?: string;
    coldWallet?: string;
    requireColdWalletForFreeze?: boolean;
    requireColdWalletForClawback?: boolean;
  }
) {
  if (!prisma) {
    throw new Error('Prisma não disponível');
  }

  if (!isValidAddress(issuer)) {
    throw new Error('Endereço issuer inválido');
  }

  const data: any = {
    issuer,
    network,
    canFreeze: config.canFreeze ?? false,
    canClawback: config.canClawback ?? false,
    canAuthorize: config.canAuthorize ?? true,
    authorizedWallets: config.authorizedWallets || [],
    requireColdWalletForFreeze: config.requireColdWalletForFreeze ?? true,
    requireColdWalletForClawback: config.requireColdWalletForClawback ?? true,
  };

  if (config.regularKey && isValidAddress(config.regularKey)) {
    data.regularKey = config.regularKey;
  }

  if (config.coldWallet && isValidAddress(config.coldWallet)) {
    data.coldWallet = config.coldWallet;
  } else {
    data.coldWallet = issuer; // Padrão: issuer é a cold wallet
  }

  return prisma.issuerPermission.upsert({
    where: {
      issuer_network: {
        issuer,
        network,
      },
    },
    create: data,
    update: data,
  });
}
