import { NextRequest, NextResponse } from 'next/server';
import { createMPT } from '@/lib/xrpl/mpt-helpers';
import { getPrismaClient } from '@/lib/prisma';
import { decryptSecret } from '@/lib/utils/crypto';

/**
 * API Route para criar um MPT (Multi-Purpose Token)
 * 
 * POST /api/mpt/create
 * 
 * Body:
 * {
 *   walletId?: string,          // ID da carteira de serviço (recomendado)
 *   issuerAddress?: string,     // OU endereço + seed direto
 *   issuerSeed?: string,
 *   assetScale?: number,        // Decimais (0-9)
 *   maximumAmount?: string,     // Supply máximo
 *   transferFee?: number,       // Taxa em basis points
 *   metadata?: object,          // Metadados customizados
 *   metadataOverrides?: object, // Sobrescrita de metadados padrão
 *   tokenType?: string,         // land, build, rev, col
 *   flags?: object,             // canTransfer, requireAuth, etc
 *   network?: string            // testnet, mainnet, devnet
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    const body = await request.json();
    const {
      issuerAddress: rawIssuerAddress,
      issuerSeed: rawIssuerSeed,
      assetScale = 0,
      maximumAmount = '0',
      transferFee = 0,
      metadata,
      metadataOverrides,
      tokenType = 'land',
      flags,
      walletId,
      network: rawNetwork = 'testnet'
    } = body;

    let issuerAddress = rawIssuerAddress;
    let issuerSeed = rawIssuerSeed;
    let network = rawNetwork as 'testnet' | 'mainnet' | 'devnet';
    let issuerWalletId: string | undefined = walletId;

    // Se walletId foi fornecido, buscar dados da carteira
    if (walletId) {
      if (!prisma) {
        return NextResponse.json(
          { error: 'DATABASE_URL não configurada. Configure o banco para usar carteiras de serviço.' },
          { status: 503 },
        );
      }

      const wallet = await prisma.serviceWallet.findUnique({
        where: { id: walletId },
      });

      if (!wallet) {
        return NextResponse.json(
          { error: 'Carteira de serviço não encontrada' },
          { status: 404 },
        );
      }

      issuerAddress = wallet.address;
      issuerSeed = decryptSecret(wallet.seedEncrypted);
      network = (wallet.network as 'testnet' | 'mainnet' | 'devnet') || network;
    }

    // Validações básicas
    if (!issuerAddress || typeof issuerAddress !== 'string') {
      return NextResponse.json(
        { error: 'issuerAddress é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    if (!issuerSeed || typeof issuerSeed !== 'string') {
      return NextResponse.json(
        { error: 'issuerSeed é obrigatório para criar MPT' },
        { status: 400 }
      );
    }

    if (!issuerAddress.startsWith('r') || issuerAddress.length < 25) {
      return NextResponse.json(
        { error: 'issuerAddress inválido (deve começar com "r")' },
        { status: 400 }
      );
    }

    const validTokenTypes = ['land', 'build', 'rev', 'col'];
    const normalizedTokenType = tokenType?.toLowerCase() || 'land';
    if (!validTokenTypes.includes(normalizedTokenType)) {
      return NextResponse.json(
        { error: 'tokenType inválido. Use: land, build, rev ou col.' },
        { status: 400 }
      );
    }

    // Criar MPT on-chain
    console.log('[API MPT Create] Criando MPT on-chain...', {
      issuerAddress,
      assetScale,
      maximumAmount,
      tokenType: normalizedTokenType,
      network,
    });

    const result = await createMPT({
      issuerAddress,
      issuerSeed,
      assetScale,
      maximumAmount,
      transferFee,
      metadata,
      metadataOverrides,
      tokenType: normalizedTokenType as 'land' | 'build' | 'rev' | 'col',
      flags,
      network
    });

    console.log('[API MPT Create] MPT criado on-chain:', {
      mptokenIssuanceID: result.mptokenIssuanceID,
      txHash: result.txHash,
    });

    // Salvar no banco de dados (se prisma disponível)
    let savedIssuance = null;
    if (prisma && issuerWalletId) {
      try {
        // Gerar nome e símbolo
        const tokenName = metadataOverrides?.name || metadata?.name || `${normalizedTokenType.toUpperCase()}-MPT`;
        const tokenSymbol = `${normalizedTokenType.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

        savedIssuance = await prisma.mPTIssuance.create({
          data: {
            type: normalizedTokenType.toUpperCase(),
            symbol: tokenSymbol,
            name: tokenName as string,
            maximumAmount: maximumAmount,
            decimals: assetScale,
            assetScale: assetScale,
            transferFee: transferFee,
            issuerWalletId: issuerWalletId,
            xrplIssuanceId: result.mptokenIssuanceID,
            xrplCurrency: result.currency || null,
            issuanceTxHash: result.txHash,
            metadataJson: JSON.parse(JSON.stringify(result.metadata || {})),
            flags: JSON.parse(JSON.stringify(flags || {})),
            network: network,
            status: 'CREATED',
            totalMinted: '0',
            distributionBalance: '0',
          },
        });

        console.log('[API MPT Create] MPT salvo no banco:', savedIssuance.id);
      } catch (dbError: any) {
        console.error('[API MPT Create] Erro ao salvar no banco (MPT foi criado on-chain):', dbError);
        // Não falhar a requisição, MPT já foi criado on-chain
      }
    }

    return NextResponse.json({
      success: true,
      mptokenIssuanceID: result.mptokenIssuanceID,
      txHash: result.txHash,
      currency: result.currency,
      ticker: result.ticker,
      metadata: result.metadata,
      tokenType: normalizedTokenType,
      // Dados do banco (se salvou)
      issuanceId: savedIssuance?.id || null,
      savedToDatabase: !!savedIssuance,
    });
  } catch (error: any) {
    console.error('[API MPT Create] Erro:', error);
    return NextResponse.json(
      {
        error: error.message || 'Erro ao criar MPT',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

