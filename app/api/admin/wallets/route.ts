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
      network = 'testnet',
      seed,
      fund = true,
    } = body;

    if (!label || typeof label !== 'string') {
      return NextResponse.json(
        { error: 'label é obrigatório e deve ser uma string' },
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

    if (!seed && network === 'testnet' && fund) {
      try {
        const faucetUrl = 'https://faucet.altnet.rippletest.net/accounts';
        const response = await fetch(faucetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            destination: wallet.address,
            xrpAmount: '1000'
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Faucet retornou ${response.status}`);
        }
        
        // Aguardar um pouco para o funding ser processado
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (fundError) {
        console.warn('[ServiceWallet][POST] Falha ao financiar carteira testnet:', fundError);
      }
    }

    const encryptedSeed = encryptSecret(seedToStore);

    const created = await prisma.serviceWallet.create({
      data: {
        label,
        document: document || null,
        type,
        network,
        address: wallet.address,
        publicKey: wallet.publicKey,
        seedEncrypted: encryptedSeed,
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


