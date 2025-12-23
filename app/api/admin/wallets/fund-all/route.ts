import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

/**
 * API Route para fundar TODAS as carteiras de serviço via faucet
 * POST /api/admin/wallets/fund-all
 * 
 * Body (opcional):
 * {
 *   network?: 'testnet' | 'devnet' // Se não informado, funda todas
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada.' },
        { status: 503 },
      );
    }

    // Parâmetro opcional para filtrar por rede
    let filterNetwork: string | undefined;
    try {
      const body = await request.json();
      filterNetwork = body.network;
    } catch {
      // Body vazio, fundar todas
    }

    // Buscar todas as carteiras (exceto mainnet)
    const wallets = await prisma.serviceWallet.findMany({
      where: {
        network: {
          in: filterNetwork ? [filterNetwork] : ['testnet', 'devnet'],
        },
      },
    });

    if (wallets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhuma carteira encontrada para fundar',
        results: [],
      });
    }

    const faucetUrls: Record<string, string> = {
      testnet: 'https://faucet.altnet.rippletest.net/accounts',
      devnet: 'https://faucet.devnet.rippletest.net/accounts',
    };

    console.log(`[FundAll] Fundando ${wallets.length} carteiras...`);

    const results: Array<{
      id: string;
      address: string;
      network: string;
      success: boolean;
      message: string;
    }> = [];

    // Fundar cada carteira com delay para não sobrecarregar o faucet
    for (const wallet of wallets) {
      const faucetUrl = faucetUrls[wallet.network];
      
      if (!faucetUrl) {
        results.push({
          id: wallet.id,
          address: wallet.address,
          network: wallet.network,
          success: false,
          message: 'Rede não suportada para faucet',
        });
        continue;
      }

      try {
        console.log(`[FundAll] Fundando ${wallet.address} na ${wallet.network}...`);
        
        const response = await fetch(faucetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: wallet.address,
            xrpAmount: '1000',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          results.push({
            id: wallet.id,
            address: wallet.address,
            network: wallet.network,
            success: false,
            message: `Faucet retornou ${response.status}: ${errorText.slice(0, 100)}`,
          });
        } else {
          const faucetResponse = await response.json();
          results.push({
            id: wallet.id,
            address: wallet.address,
            network: wallet.network,
            success: true,
            message: `Fundado com ${faucetResponse.amount || '1000'} XRP`,
          });
        }

        // Delay entre requisições para não sobrecarregar o faucet
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        results.push({
          id: wallet.id,
          address: wallet.address,
          network: wallet.network,
          success: false,
          message: error.message || 'Erro desconhecido',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`[FundAll] Concluído: ${successCount} sucesso, ${failCount} falhas`);

    return NextResponse.json({
      success: true,
      message: `Fundadas ${successCount} de ${wallets.length} carteiras`,
      totalWallets: wallets.length,
      successCount,
      failCount,
      results,
    });
  } catch (error: any) {
    console.error('[FundAll] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao fundar carteiras' },
      { status: 500 },
    );
  }
}

