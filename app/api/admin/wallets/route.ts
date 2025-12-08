import { NextRequest, NextResponse } from 'next/server';
import { Wallet } from 'xrpl';
import { getPrismaClient } from '@/lib/prisma';
import { encryptSecret } from '@/lib/utils/crypto';

function sanitizeWallet(wallet: any) {
  if (!wallet) return null;
  const { seedEncrypted, ...rest } = wallet;
  return rest;
}

export async function GET() {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Configure o banco para listar carteiras.' },
        { status: 503 },
      );
    }

    const wallets = await prisma.serviceWallet.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(wallets.map(sanitizeWallet));
  } catch (error) {
    console.error('[ServiceWallet][GET] Erro ao listar carteiras:', error);
    return NextResponse.json(
      { error: 'Erro ao listar carteiras de serviço' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Configure o banco para criar carteiras.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const {
      label,
      document,
      type = 'issuer',
      network: requestedNetwork = 'devnet',
      seed,
      fund = true,
      userId, // Para carteiras USER_INTERNAL
      isActive = false, // Por padrão, novas carteiras não são ativas
    } = body;

    // Por enquanto, forçar uso de devnet (seleção de rede será implementada futuramente)
    const network = 'devnet';

    if (!label || typeof label !== 'string') {
      return NextResponse.json(
        { error: 'label é obrigatório e deve ser uma string' },
        { status: 400 },
      );
    }

    // Validar e normalizar tipo de carteira
    const validTypes = ['ISSUER', 'DISTRIBUTION', 'USER_INTERNAL', 'USER_EXTERNAL'];
    const normalizedType = type.toUpperCase();
    
    // Mapear tipos antigos para novos (compatibilidade)
    const typeMapping: Record<string, string> = {
      'ISSUER': 'ISSUER',
      'DISTRIBUTION': 'DISTRIBUTION',
      'USER_INTERNAL': 'USER_INTERNAL',
      'USER_EXTERNAL': 'USER_EXTERNAL',
      'issuer': 'ISSUER',
      'distribution': 'DISTRIBUTION',
      'user_internal': 'USER_INTERNAL',
      'user_external': 'USER_EXTERNAL',
    };
    
    const finalType = typeMapping[normalizedType] || normalizedType;
    
    if (!validTypes.includes(finalType)) {
      return NextResponse.json(
        { error: `type inválido. Use: ISSUER, DISTRIBUTION, USER_INTERNAL ou USER_EXTERNAL` },
        { status: 400 },
      );
    }

    // Validar userId para carteiras USER_INTERNAL
    if (finalType === 'USER_INTERNAL' && !userId) {
      return NextResponse.json(
        { error: 'userId é obrigatório para carteiras do tipo USER_INTERNAL' },
        { status: 400 },
      );
    }
    
    // Verificar se userId existe no banco (se fornecido)
    if (userId) {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      
      if (!userExists) {
        return NextResponse.json(
          { error: 'userId não encontrado no banco de dados' },
          { status: 404 },
        );
      }
    }

    // Validar network
    const validNetworks = ['testnet', 'mainnet', 'devnet'];
    if (!validNetworks.includes(network)) {
      return NextResponse.json(
        { error: `network inválido. Use: testnet, mainnet ou devnet` },
        { status: 400 },
      );
    }

    let wallet: Wallet;
    if (seed) {
      try {
        wallet = Wallet.fromSeed(seed);
      } catch (error) {
        return NextResponse.json(
          { error: 'Seed inválida. Verifique o formato e tente novamente.' },
          { status: 400 },
        );
      }
    } else {
      wallet = Wallet.generate();
    }

    const seedToStore = wallet.seed;
    if (!seedToStore) {
      return NextResponse.json(
        { error: 'Não foi possível obter a seed da carteira gerada.' },
        { status: 500 },
      );
    }

    // Fundar carteira automaticamente via faucet (devnet por padrão)
    if (!seed && fund) {
      try {
        const faucetUrls: Record<string, string> = {
          testnet: 'https://faucet.altnet.rippletest.net/accounts',
          devnet: 'https://faucet.devnet.rippletest.net/accounts',
        };
        
        const faucetUrl = faucetUrls[network];
        console.log(`[ServiceWallet][POST] Fundando carteira na ${network}:`, wallet.address);
        
        const response = await fetch(faucetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            destination: wallet.address,
            xrpAmount: '1000'
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[ServiceWallet][POST] Faucet ${network} retornou ${response.status}:`, errorText);
          throw new Error(`Faucet retornou ${response.status}`);
        }
        
        const faucetResponse = await response.json();
        console.log(`[ServiceWallet][POST] Faucet ${network} resposta:`, faucetResponse);
        
        // Aguardar um pouco para o funding ser processado
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`[ServiceWallet][POST] Carteira fundada com sucesso na ${network}`);
      } catch (fundError) {
        console.warn(`[ServiceWallet][POST] Falha ao financiar carteira ${network}:`, fundError);
        // Não falhar a criação, apenas avisar
      }
    }

    const encryptedSeed = encryptSecret(seedToStore);

    // Usar classicAddress para garantir compatibilidade
    const walletAddress = wallet.classicAddress || wallet.address;
    
    // Verificar se o endereço já existe
    const existingWallet = await prisma.serviceWallet.findUnique({
      where: { address: walletAddress },
      select: { id: true },
    });
    
    if (existingWallet) {
      return NextResponse.json(
        { error: 'Uma carteira com este endereço já existe' },
        { status: 409 },
      );
    }

    const created = await prisma.serviceWallet.create({
      data: {
        label,
        document: document || null,
        type: finalType, // Usar tipo normalizado e validado
        network,
        address: walletAddress, // Usar classicAddress
        publicKey: wallet.publicKey,
        seedEncrypted: encryptedSeed,
        userId: userId || null, // Salvar userId se fornecido
        isActive: isActive || false, // Salvar isActive
      },
    });

    return NextResponse.json(sanitizeWallet(created), { status: 201 });
  } catch (error: any) {
    console.error('[ServiceWallet][POST] Erro ao criar carteira:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao criar carteira de serviço' },
      { status: 500 },
    );
  }
}


