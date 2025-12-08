import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';
import { createMPTSimple, testConnection } from '@/lib/xrpl/simple-client';

/**
 * Endpoint de teste para criar MPT com cliente simples
 * 
 * POST /api/mpt/test-create
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    const body = await request.json();
    const {
      walletId,
      tokenName = 'TEST-MPT',
      assetScale = 0,
      maximumAmount = '1000000',
      transferFee = 0,
      flags = { canTransfer: true },
      network: rawNetwork = 'testnet'
    } = body;

    let issuerSeed: string;
    let issuerAddress: string;
    let network = rawNetwork as 'testnet' | 'mainnet' | 'devnet';

    // Buscar wallet pelo ID
    if (walletId && prisma) {
      const wallet = await prisma.serviceWallet.findUnique({
        where: { id: walletId },
      });

      if (!wallet) {
        return NextResponse.json(
          { error: 'Carteira não encontrada' },
          { status: 404 },
        );
      }

      issuerAddress = wallet.address;
      issuerSeed = decryptSecret(wallet.seedEncrypted);
      network = (wallet.network as 'testnet' | 'mainnet' | 'devnet') || network;
    } else {
      return NextResponse.json(
        { error: 'walletId é obrigatório' },
        { status: 400 },
      );
    }

    console.log(`[Test Create MPT] Iniciando criação...`);
    console.log(`[Test Create MPT] Wallet: ${issuerAddress}`);
    console.log(`[Test Create MPT] Network: ${network}`);

    // Criar MPT usando cliente simples
    const result = await createMPTSimple({
      issuerSeed,
      assetScale,
      maximumAmount,
      transferFee,
      metadata: {
        name: tokenName,
        description: `Token de teste criado em ${new Date().toISOString()}`,
      },
      flags,
      network,
    });

    console.log(`[Test Create MPT] MPT criado com sucesso!`);
    console.log(`[Test Create MPT] ID: ${result.mptokenIssuanceID}`);
    console.log(`[Test Create MPT] TX: ${result.txHash}`);

    // Salvar no banco se disponível
    let savedIssuance = null;
    if (prisma) {
      try {
        savedIssuance = await prisma.mPTIssuance.create({
          data: {
            type: 'LAND',
            symbol: `TEST-${Date.now().toString(36).toUpperCase()}`,
            name: tokenName,
            maximumAmount: maximumAmount,
            decimals: assetScale,
            assetScale: assetScale,
            transferFee: transferFee,
            issuerWalletId: walletId,
            xrplIssuanceId: result.mptokenIssuanceID,
            xrplCurrency: null,
            issuanceTxHash: result.txHash,
            metadataJson: { name: tokenName },
            flags: flags || {},
            network: network,
            status: 'CREATED',
            totalMinted: '0',
            distributionBalance: '0',
          },
        });
        console.log(`[Test Create MPT] Salvo no banco: ${savedIssuance.id}`);
      } catch (dbError: any) {
        console.error(`[Test Create MPT] Erro ao salvar no banco:`, dbError.message);
      }
    }

    return NextResponse.json({
      success: true,
      mptokenIssuanceID: result.mptokenIssuanceID,
      txHash: result.txHash,
      issuerAddress: result.issuerAddress,
      network,
      savedToDatabase: !!savedIssuance,
      issuanceId: savedIssuance?.id || null,
    });
  } catch (error: any) {
    console.error('[Test Create MPT] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao criar MPT',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

/**
 * Testar conexão com a rede
 * 
 * GET /api/mpt/test-create?network=testnet
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const network = (searchParams.get('network') as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

  const result = await testConnection(network);
  return NextResponse.json(result);
}

