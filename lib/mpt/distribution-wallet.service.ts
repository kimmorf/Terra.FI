/**
 * Serviço para gerenciar carteiras de distribuição de MPT
 */

import { Wallet } from 'xrpl';
import { getPrismaClient } from '@/lib/prisma';
import { encryptSecret } from '@/lib/utils/crypto';
import { xrplPool, type XRPLNetwork } from '@/lib/xrpl/pool';

export interface CreateDistributionWalletParams {
  label: string;
  network: XRPLNetwork;
  issuanceId?: string; // Opcional: ID da emissão para associar
}

export interface DistributionWalletResult {
  id: string;
  address: string;
  label: string;
  network: string;
}

/**
 * Cria uma nova carteira de distribuição XRPL
 */
export async function createDistributionWallet(
  params: CreateDistributionWalletParams
): Promise<DistributionWalletResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('DATABASE_URL não configurada');
  }

  const { label, network, issuanceId } = params;

  // Gerar nova carteira XRPL
  const wallet = Wallet.generate();
  
  // Fundar a carteira na rede (se necessário)
  // Nota: Em testnet, pode ser necessário fundar via faucet
  // Por enquanto, apenas criamos a carteira e salvamos

  // Criptografar seed
  const encryptedSeed = encryptSecret(wallet.seed!);

  // Salvar no banco
  const created = await prisma.serviceWallet.create({
    data: {
      label,
      type: 'DISTRIBUTION',
      network,
      address: wallet.classicAddress,
      publicKey: wallet.publicKey,
      seedEncrypted: encryptedSeed,
      isActive: true,
    },
  });

  return {
    id: created.id,
    address: created.address,
    label: created.label,
    network: created.network,
  };
}

/**
 * Busca ou cria uma carteira de distribuição para uma emissão
 */
export async function getOrCreateDistributionWallet(
  issuanceId: string,
  label: string,
  network: XRPLNetwork
): Promise<DistributionWalletResult> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('DATABASE_URL não configurada');
  }

  // Verificar se a emissão já tem uma carteira de distribuição
  const issuance = await prisma.mPTIssuance.findUnique({
    where: { id: issuanceId },
    include: { distributionWallet: true },
  }).catch(() => null);

  if (issuance?.distributionWallet) {
    return {
      id: issuance.distributionWallet.id,
      address: issuance.distributionWallet.address,
      label: issuance.distributionWallet.label,
      network: issuance.distributionWallet.network,
    };
  }

  // Criar nova carteira
  return await createDistributionWallet({ label, network, issuanceId });
}

