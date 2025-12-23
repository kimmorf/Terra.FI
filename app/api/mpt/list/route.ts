import { NextRequest, NextResponse } from 'next/server';
import { getIssuedMPTokens } from '@/lib/xrpl/mpt';
import { isValidXRPLAddress } from '@/lib/xrpl/validation';
import { getPrismaClient } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const issuer = searchParams.get('issuer');
    const walletId = searchParams.get('walletId');
    const network = (searchParams.get('network') as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

    if (!issuer) {
      return NextResponse.json(
        { error: 'Parâmetro "issuer" é obrigatório' },
        { status: 400 }
      );
    }

    if (!isValidXRPLAddress(issuer)) {
      return NextResponse.json(
        { error: 'Endereço XRPL inválido' },
        { status: 400 }
      );
    }

    // Buscar MPTs on-chain
    const mptokens = await getIssuedMPTokens({
      issuer,
      network,
    });

    // Garantir que é um array
    const tokensArray = Array.isArray(mptokens) ? mptokens : [];

    // Buscar dados do banco de dados para enriquecer com nomes e metadados
    const prisma = getPrismaClient();
    let dbIssuances: any[] = [];
    
    if (prisma) {
      try {
        // Buscar por walletId se fornecido, ou pelo endereço do issuer
        const whereClause = walletId 
          ? { issuerWalletId: walletId, network }
          : { issuerWallet: { address: issuer }, network };
        
        dbIssuances = await prisma.mPTIssuance.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            symbol: true,
            type: true,
            xrplIssuanceId: true,
            metadataJson: true,
            maximumAmount: true,
            assetScale: true,
            decimals: true,
            transferFee: true,
            flags: true,
            status: true,
            createdAt: true,
          },
        });
        
        console.log(`[MPT List] Encontrados ${dbIssuances.length} MPTs no banco para ${issuer}`);
      } catch (dbError) {
        console.error('[MPT List] Erro ao buscar do banco:', dbError);
        // Continuar sem dados do banco
      }
    }

    // Criar mapa de issuanceId -> dados do banco
    const dbMap = new Map<string, any>();
    for (const dbIss of dbIssuances) {
      if (dbIss.xrplIssuanceId) {
        dbMap.set(dbIss.xrplIssuanceId.toUpperCase(), dbIss);
      }
    }

    // Enriquecer tokens on-chain com dados do banco
    const enrichedTokens = tokensArray.map((token: any) => {
      const issuanceIdUpper = token.issuanceIdHex?.toUpperCase();
      const dbData = dbMap.get(issuanceIdUpper);
      
      if (dbData) {
        // Merge com dados do banco (banco tem prioridade para nome e metadados)
        return {
          ...token,
          metadata: {
            ...(token.metadata || {}),
            name: dbData.name || token.metadata?.name,
            symbol: dbData.symbol,
            type: dbData.type,
            ...(typeof dbData.metadataJson === 'object' ? dbData.metadataJson : {}),
          },
          dbId: dbData.id,
          status: dbData.status,
          // Usar dados do banco se on-chain não tiver
          assetScale: token.assetScale || dbData.assetScale || dbData.decimals || 0,
          maximumAmount: token.maximumAmount !== '0' ? token.maximumAmount : (dbData.maximumAmount || '0'),
          transferFee: token.transferFee || dbData.transferFee || 0,
        };
      }
      
      return token;
    });

    // Adicionar MPTs que estão no banco mas não foram encontrados on-chain (pode acontecer com atraso de rede)
    for (const dbIss of dbIssuances) {
      if (dbIss.xrplIssuanceId) {
        const existsOnChain = tokensArray.some(
          (t: any) => t.issuanceIdHex?.toUpperCase() === dbIss.xrplIssuanceId?.toUpperCase()
        );
        
        if (!existsOnChain) {
          enrichedTokens.push({
            issuanceIdHex: dbIss.xrplIssuanceId,
            assetScale: dbIss.assetScale || dbIss.decimals || 0,
            maximumAmount: dbIss.maximumAmount || '0',
            transferFee: dbIss.transferFee || 0,
            flags: typeof dbIss.flags === 'object' ? dbIss.flags : {},
            metadata: {
              name: dbIss.name,
              symbol: dbIss.symbol,
              type: dbIss.type,
              ...(typeof dbIss.metadataJson === 'object' ? dbIss.metadataJson : {}),
            },
            dbId: dbIss.id,
            status: dbIss.status,
            source: 'database', // Indicar que veio apenas do banco
          });
        }
      }
    }

    return NextResponse.json({
      issuer,
      network,
      count: enrichedTokens.length,
      tokens: enrichedTokens,
    });
  } catch (error: any) {
    console.error('[MPT List] Erro:', error);

    return NextResponse.json(
      { error: error.message || 'Erro ao listar MPTs emitidos' },
      { status: 500 }
    );
  }
}
