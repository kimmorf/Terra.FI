import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST - Login com endereço da carteira (Crossmark)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, network, publicKey } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'Endereço da carteira é obrigatório' },
        { status: 400 }
      );
    }

    // Valida formato básico do endereço XRPL (começa com 'r')
    if (!address.startsWith('r') || address.length < 25) {
      return NextResponse.json(
        { error: 'Endereço da carteira inválido' },
        { status: 400 }
      );
    }

    // Busca ou cria usuário baseado no endereço da carteira
    let user = await prisma.user.findUnique({
      where: { walletAddress: address },
      include: {
        accounts: true,
      },
    });

    if (!user) {
      // Cria novo usuário com o endereço da carteira
      user = await prisma.user.create({
        data: {
          name: `Wallet ${address.slice(0, 8)}...${address.slice(-6)}`,
          walletAddress: address,
          email: null, // Não temos email, apenas wallet address
        },
        include: {
          accounts: true,
        },
      });

      // Cria uma Account no Better Auth para o provider "crossmark"
      await prisma.account.create({
        data: {
          userId: user.id,
          type: 'wallet',
          provider: 'crossmark',
          providerAccountId: address,
        },
      });
    } else {
      // Verifica se já tem Account do Crossmark, se não, cria
      const hasCrossmarkAccount = user.accounts.some(
        (acc) => acc.provider === 'crossmark' && acc.providerAccountId === address
      );

      if (!hasCrossmarkAccount) {
        await prisma.account.create({
          data: {
            userId: user.id,
            type: 'wallet',
            provider: 'crossmark',
            providerAccountId: address,
          },
        });
      }
    }

    // Cria sessão manualmente compatível com Better Auth
    const sessionToken = crypto.randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 dias

    // Cria nova sessão
    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    // Cria a resposta
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        walletAddress: user.walletAddress,
      },
    });

    // Define o cookie de sessão do Better Auth
    response.cookies.set('better-auth.session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Erro ao fazer login com carteira:', error);
    return NextResponse.json(
      { error: 'Erro ao fazer login com carteira' },
      { status: 500 }
    );
  }
}
