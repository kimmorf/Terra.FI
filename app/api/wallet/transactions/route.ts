import { NextRequest, NextResponse } from 'next/server';
import { getAccountTransactions } from '@/lib/xrpl/mpt';
import { isValidXRPLAddress } from '@/lib/xrpl/validation';
import type { XRPLNetwork } from '@/lib/xrpl/pool';
import { dropsToXrp } from '@/lib/utils/xrp-converter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/transactions
 * 
 * Retorna histórico de transações de uma carteira
 * 
 * Query params:
 * - address: endereço XRPL (obrigatório)
 * - network: testnet | devnet | mainnet (padrão: testnet)
 * - limit: número máximo de transações (padrão: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');
    const network = (searchParams.get('network') as XRPLNetwork) || 'testnet';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!address) {
      return NextResponse.json(
        { error: 'Parâmetro "address" é obrigatório' },
        { status: 400 }
      );
    }

    if (!isValidXRPLAddress(address)) {
      return NextResponse.json(
        { error: 'Endereço XRPL inválido' },
        { status: 400 }
      );
    }

    const rawTransactions = await getAccountTransactions({
      account: address,
      network,
      limit: Math.min(limit, 100), // Limitar a 100
    });

    // Formatar transações
    const transactions = rawTransactions.map((txWrapper: any) => {
      const tx = txWrapper.tx || txWrapper.tx_json || txWrapper;
      const meta = txWrapper.meta || {};
      
      // Extrair informações básicas
      const hash = tx.hash || txWrapper.hash;
      const type = tx.TransactionType;
      const account = tx.Account;
      const destination = tx.Destination;
      const result = meta.TransactionResult || 'unknown';
      
      // Extrair valor baseado no tipo
      let amount: string | null = null;
      let currency = 'XRP';
      
      if (tx.Amount) {
        if (typeof tx.Amount === 'string') {
          // XRP em drops
          amount = dropsToXrp(tx.Amount);
          currency = 'XRP';
        } else if (typeof tx.Amount === 'object') {
          // Token
          amount = tx.Amount.value;
          currency = tx.Amount.currency;
          if (tx.Amount.mpt_issuance_id) {
            currency = 'MPT';
          }
        }
      }
      
      // Extrair timestamp
      let timestamp: string | null = null;
      if (tx.date) {
        // XRPL timestamp é em segundos desde 01/01/2000
        const xrplEpoch = 946684800; // Segundos desde Unix epoch até XRPL epoch
        const unixTimestamp = (tx.date + xrplEpoch) * 1000;
        timestamp = new Date(unixTimestamp).toISOString();
      }

      return {
        hash,
        type,
        source: account,
        destination,
        amount,
        currency,
        timestamp,
        result,
        fee: tx.Fee ? dropsToXrp(tx.Fee) : null,
        ledgerIndex: txWrapper.ledger_index,
      };
    });

    return NextResponse.json({
      address,
      network,
      transactions,
      count: transactions.length,
    });
  } catch (error: any) {
    console.error('[API Wallet Transactions] Erro:', error);
    
    // Tratar erro de conta não encontrada
    if (error.message?.includes('actNotFound') || error.message?.includes('Account not found')) {
      return NextResponse.json({
        address: null,
        network: 'testnet',
        transactions: [],
        count: 0,
        error: 'Conta não encontrada na rede.',
      });
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao buscar transações' },
      { status: 500 }
    );
  }
}

