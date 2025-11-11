import { xrplPool, type XRPLNetwork } from './pool';
import { isValidXRPLAddress } from './validation';
import { withXRPLRetry } from '../utils/retry';
import { cache } from '../utils/cache';

export interface CreateOfferParams {
  account: string;
  takerGets: {
    currency: string;
    issuer: string;
    value: string;
  };
  takerPays: string | {
    currency: string;
    issuer: string;
    value: string;
  };
  expiration?: number; // Unix timestamp (opcional)
  network?: XRPLNetwork;
}

export interface Offer {
  sequence: number;
  takerGets: string | { currency: string; issuer: string; value: string };
  takerPays: string | { currency: string; issuer: string; value: string };
  flags: number;
  expiration?: number;
  bookDirectory?: string;
  bookNode?: string;
  ownerNode?: string;
  previousTxnID?: string;
  previousTxnLgrSeq?: number;
}

export interface BookOffer {
  takerGets: string | { currency: string; issuer: string; value: string };
  takerPays: string | { currency: string; issuer: string; value: string };
  owner: string;
  bookDirectory: string;
  bookNode: string;
  expiration?: number;
  ledgerIndex?: number;
}

/**
 * Cria uma oferta no DEX (OfferCreate)
 * Esta função deve ser chamada do lado do cliente (browser)
 * @param params Parâmetros da oferta
 * @returns Hash da transação
 */
export async function createOffer(params: CreateOfferParams): Promise<string> {
  const { account, takerGets, takerPays, expiration, network = 'testnet' } = params;

  if (typeof window === 'undefined') {
    throw new Error('createOffer deve ser chamado do lado do cliente');
  }

  if (!isValidXRPLAddress(account)) {
    throw new Error('Endereço da conta inválido');
  }

  if (!isValidXRPLAddress(takerGets.issuer)) {
    throw new Error('Endereço do emissor de TakerGets inválido');
  }

  // Se takerPays é um objeto, validar issuer
  if (typeof takerPays === 'object' && !isValidXRPLAddress(takerPays.issuer)) {
    throw new Error('Endereço do emissor de TakerPays inválido');
  }

  const client = await xrplPool.getClient(network);

  const transaction: any = {
    TransactionType: 'OfferCreate',
    Account: account,
    TakerGets: takerGets,
    TakerPays: takerPays,
  };

  // Adicionar expiração se fornecida
  if (expiration) {
    transaction.Expiration = expiration;
  }

  // Preparar transação
  const prepared = await client.autofill(transaction);

  // Assinar e submeter usando Crossmark
  const { signAndSubmitTransaction } = await import('../crossmark/transactions');
  const response = await signAndSubmitTransaction(prepared, { network, timeout: 60000 });

  // Extrair hash usando a função de extração
  const { extractTransactionHash } = await import('../crossmark/transactions');
  const hash = extractTransactionHash(response);

  if (!hash) {
    throw new Error('Não foi possível obter hash da transação');
  }

  return hash;
}

/**
 * Cancela uma oferta no DEX (OfferCancel)
 * Esta função deve ser chamada do lado do cliente (browser)
 * @param account Endereço da conta
 * @param offerSequence Sequence da oferta a ser cancelada
 * @param network Rede XRPL
 * @returns Hash da transação
 */
export async function cancelOffer(
  account: string,
  offerSequence: number,
  network: XRPLNetwork = 'testnet'
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('cancelOffer deve ser chamado do lado do cliente');
  }

  if (!isValidXRPLAddress(account)) {
    throw new Error('Endereço da conta inválido');
  }

  const client = await xrplPool.getClient(network);

  const transaction = {
    TransactionType: 'OfferCancel',
    Account: account,
    OfferSequence: offerSequence,
  };

  // Preparar transação
  const prepared = await client.autofill(transaction);

  // Assinar e submeter usando Crossmark
  const { signAndSubmitTransaction } = await import('../crossmark/transactions');
  const response = await signAndSubmitTransaction(prepared, { network, timeout: 60000 });

  // Extrair hash usando a função de extração
  const { extractTransactionHash } = await import('../crossmark/transactions');
  const hash = extractTransactionHash(response);

  if (!hash) {
    throw new Error('Não foi possível obter hash da transação');
  }

  return hash;
}

/**
 * Obtém todas as ofertas de uma conta
 * @param account Endereço da conta
 * @param network Rede XRPL
 * @returns Lista de ofertas
 */
export async function getAccountOffers(
  account: string,
  network: XRPLNetwork = 'testnet'
): Promise<Offer[]> {
  if (!isValidXRPLAddress(account)) {
    throw new Error('Endereço da conta inválido');
  }

  const cacheKey = `account_offers:${network}:${account}`;
  const cached = cache.get<Offer[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await withXRPLRetry(async () => {
    const client = await xrplPool.getClient(network);
    const response = await client.request({
      command: 'account_offers',
      account,
      ledger_index: 'validated',
    });
    return response.result;
  }, { maxAttempts: 3 });

  const offers: Offer[] = (result.offers || []).map((offer: any) => ({
    sequence: offer.seq,
    takerGets: offer.taker_gets,
    takerPays: offer.taker_pays,
    flags: offer.flags,
    expiration: offer.expiration,
    bookDirectory: offer.book_directory,
    bookNode: offer.book_node,
    ownerNode: offer.owner_node,
    previousTxnID: offer.previous_txn_id,
    previousTxnLgrSeq: offer.previous_txn_lgr_seq,
  }));

  // Cachear por 5 segundos
  cache.set(cacheKey, offers, 5000);

  return offers;
}

/**
 * Obtém o book de ofertas para um par de tokens
 * @param takerGets O que o taker recebe (token que está sendo vendido)
 * @param takerPays O que o taker paga (token que está sendo comprado)
 * @param network Rede XRPL
 * @param limit Limite de ofertas a retornar (padrão: 20)
 * @returns Lista de ofertas do book
 */
export async function getBookOffers(
  takerGets: { currency: string; issuer: string },
  takerPays: string | { currency: string; issuer: string },
  network: XRPLNetwork = 'testnet',
  limit: number = 20
): Promise<BookOffer[]> {
  if (!isValidXRPLAddress(takerGets.issuer)) {
    throw new Error('Endereço do emissor de TakerGets inválido');
  }

  if (typeof takerPays === 'object' && !isValidXRPLAddress(takerPays.issuer)) {
    throw new Error('Endereço do emissor de TakerPays inválido');
  }

  const cacheKey = `book_offers:${network}:${takerGets.currency}:${takerGets.issuer}:${typeof takerPays === 'string' ? 'XRP' : `${takerPays.currency}:${takerPays.issuer}`}`;
  const cached = cache.get<BookOffer[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await withXRPLRetry(async () => {
    const client = await xrplPool.getClient(network);
    const response = await client.request({
      command: 'book_offers',
      taker_gets: takerGets,
      taker_pays: takerPays,
      ledger_index: 'validated',
      limit,
    });
    return response.result;
  }, { maxAttempts: 3 });

  const offers: BookOffer[] = (result.offers || []).map((offer: any) => ({
    takerGets: offer.TakerGets,
    takerPays: offer.TakerPays,
    owner: offer.owner,
    bookDirectory: offer.book_directory,
    bookNode: offer.book_node,
    expiration: offer.expiration,
    ledgerIndex: offer.ledger_index,
  }));

  // Cachear por 5 segundos
  cache.set(cacheKey, offers, 5000);

  return offers;
}

/**
 * Calcula o preço de uma oferta
 * @param takerGets O que o taker recebe
 * @param takerPays O que o taker paga
 * @returns Preço (takerPays / takerGets)
 */
export function calculateOfferPrice(
  takerGets: string | { currency: string; issuer: string; value: string },
  takerPays: string | { currency: string; issuer: string; value: string }
): number {
  const getsValue = typeof takerGets === 'string' 
    ? parseFloat(takerGets) / 1000000 // XRP em drops
    : parseFloat(takerGets.value);
  
  const paysValue = typeof takerPays === 'string'
    ? parseFloat(takerPays) / 1000000 // XRP em drops
    : parseFloat(takerPays.value);

  if (getsValue === 0) {
    return 0;
  }

  return paysValue / getsValue;
}

/**
 * Formata oferta para exibição
 */
export function formatOffer(offer: Offer | BookOffer): {
  type: 'sell' | 'buy';
  price: number;
  amount: string;
  currency: string;
  issuer?: string;
} {
  const takerGets = offer.takerGets;
  const takerPays = offer.takerPays;

  // Determina se é venda (vende token por XRP/stablecoin) ou compra (compra token com XRP/stablecoin)
  const isSell = typeof takerGets === 'object' && typeof takerPays === 'string';
  const isBuy = typeof takerGets === 'string' && typeof takerPays === 'object';

  if (isSell) {
    // Venda: recebe XRP/stablecoin, paga token
    const price = calculateOfferPrice(takerGets, takerPays);
    return {
      type: 'sell',
      price,
      amount: takerGets.value,
      currency: takerGets.currency,
      issuer: takerGets.issuer,
    };
  } else if (isBuy) {
    // Compra: recebe token, paga XRP/stablecoin
    const price = calculateOfferPrice(takerPays, takerGets);
    return {
      type: 'buy',
      price,
      amount: takerPays.value,
      currency: takerPays.currency,
      issuer: takerPays.issuer,
    };
  } else {
    // Token por token
    const price = calculateOfferPrice(takerGets, takerPays);
    const getsIsToken = typeof takerGets === 'object';
    return {
      type: getsIsToken ? 'sell' : 'buy',
      price,
      amount: getsIsToken ? takerGets.value : (typeof takerPays === 'object' ? takerPays.value : '0'),
      currency: getsIsToken ? takerGets.currency : (typeof takerPays === 'object' ? takerPays.currency : 'XRP'),
      issuer: getsIsToken ? takerGets.issuer : (typeof takerPays === 'object' ? takerPays.issuer : undefined),
    };
  }
}
