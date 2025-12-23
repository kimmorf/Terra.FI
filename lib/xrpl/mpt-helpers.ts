/**
 * Helpers para Multi-Purpose Tokens (MPT) no XRPL
 * 
 * IMPORTANTE: MPTs são diferentes de IOUs tradicionais
 * - MPTs NÃO usam TrustSet - usam MPTokenAuthorize
 * - MPTs podem ser transferidos com Payment (se flags corretas)
 * - MPTs têm seu próprio ID (MPTokenIssuanceID)
 * 
 * Referências:
 * - https://js.xrpl.org/
 * - https://github.com/XRPLF/xrpl-dev-portal/blob/master/_code-samples/issue-mpt-with-metadata/js/issue-mpt-with-metadata.js
 * - https://xrpl.org/mptokenissuancecreate.html
 */

import { Wallet } from 'xrpl';
import { xrplPool, type XRPLNetwork } from './pool';
import { ReliableSubmission } from './reliable-submission';
import type { MPTokenMetadata } from '../crossmark/types';

function stringToHex(input: string): string {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(input))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function buildMetadataMemo(metadata: MPTokenMetadata) {
  const json = JSON.stringify(metadata);
  return {
    Memo: {
      MemoType: stringToHex('XLS-89'),
      MemoData: stringToHex(json),
    },
  };
}

export type MPTTokenType = 'land' | 'build' | 'rev' | 'col';

const DEFAULT_ICON_URL = 'https://terra.fi/assets/token-placeholder.png';
const DEFAULT_WEBSITE = 'https://terra.fi';
const ISSUER_NAME = 'Terra.Fi';

function pickDefined<T extends object>(value: T): T {
  const cleaned = Object.entries(value).reduce<Record<string, unknown>>((acc, [key, val]) => {
    if (val !== undefined && val !== null) {
      acc[key] = val;
    }
    return acc;
  }, {});
  return cleaned as T;
}

export function buildDefaultMetadata(
  tokenType: MPTTokenType,
  overrides: Record<string, unknown> = {},
): MPTokenMetadata {
  const base = {
    ac: 'rwa',
    i: DEFAULT_ICON_URL,
    u: DEFAULT_WEBSITE,
    in: ISSUER_NAME,
  };

  const perType: Record<MPTTokenType, Record<string, unknown>> = {
    land: {
      t: 'LAND',
      n: 'Terra.Fi Land Token',
      d: 'Fractionalized land parcel tokenized on Terra.Fi',
      parcel_id: overrides.parcel_id ?? 'VIVERDE-PARCEL-001',
      geo: overrides.geo ?? { lat: -22.8898, lng: -43.2799 },
      valuation: overrides.valuation ?? { currency: 'BRL', amount: '1000000' },
    },
    build: {
      t: 'BUILD',
      n: 'Terra.Fi Build Tranche',
      d: 'Construction CAPEX tranche linked to a land asset',
      phase_index: overrides.phase_index ?? 1,
      capex_goal: overrides.capex_goal ?? { currency: 'BRL', amount: '250000' },
      oracle_milestone: overrides.oracle_milestone ?? 'foundation_complete',
      origin_land: overrides.origin_land ?? 'LAND:VIVERDE-PARCEL-001',
    },
    rev: {
      t: 'REV',
      n: 'Terra.Fi Revenue Share',
      d: 'Revenue distribution token for tokenized assets',
      origin_asset: overrides.origin_asset ?? 'LAND:VIVERDE-PARCEL-001',
      distribution_policy: overrides.distribution_policy ?? {
        frequency: 'monthly',
        percentage: 0.12,
        payout_wallet: 'rPayoutWalletXXXXXXXXXXXXXXXXXXXXXX',
      },
    },
    col: {
      t: 'COL',
      n: 'Terra.Fi Collateral Token',
      d: 'Collateral representation of locked Terra.Fi assets',
      backing_asset: overrides.backing_asset ?? 'LAND:VIVERDE-PARCEL-001',
      haircut: overrides.haircut ?? 0.2,
      owner_wallet: overrides.owner_wallet ?? 'rOwnerWalletXXXXXXXXXXXXXXXXXXXXXX',
      lock_policy: overrides.lock_policy ?? { type: 'loan', unlock_condition: 'loan_repaid' },
    },
  };

  const merged = {
    ...base,
    ...perType[tokenType],
    ...overrides,
  };

  // Garantir que 'name' existe (mapear de 'n' se necessário)
  const cleaned = pickDefined(merged) as any;
  if (!cleaned.name && cleaned.n) {
    cleaned.name = cleaned.n;
  }
  // Se ainda não tem name, usar um padrão baseado no tipo
  if (!cleaned.name) {
    cleaned.name = `Terra.Fi ${tokenType.toUpperCase()} Token`;
  }

  return cleaned as MPTokenMetadata;
}

/**
 * Interface para criar um MPT (MPTokenIssuanceCreate)
 */
export interface CreateMPTParams {
  /** Endereço do emissor */
  issuerAddress: string;
  /** Seed da carteira emissora (necessário para assinar) */
  issuerSeed: string;
  /** Escala de precisão (0-19, quantas casas decimais) */
  assetScale?: number;
  /** Quantidade máxima ("0" = ilimitado) */
  maximumAmount?: string;
  /** Taxa de transferência em basis points (0-50000, ex: 100 = 1%) */
  transferFee?: number;
  /** Metadados do token (JSON que será convertido para hex) */
  metadata?: MPTokenMetadata;
  /** Tipo do token Terra.Fi (LAND, BUILD, REV, COL) */
  tokenType?: MPTTokenType;
  /** Sobrescrita de campos padrão do metadata */
  metadataOverrides?: Record<string, unknown>;
  /** Flags do MPT */
  flags?: {
    requireAuth?: boolean;      // Requer autorização para holder (tfMPTRequireAuth = 0x00000004)
    canTransfer?: boolean;       // Permite transferências entre holders (tfMPTCanTransfer = 0x00000020)
    canLock?: boolean;           // Permite bloquear tokens (tfMPTCanLock = 0x00000002)
    canEscrow?: boolean;         // Permite usar em escrow (tfMPTCanEscrow = 0x00000008)
    canTrade?: boolean;          // Permite negociar no DEX (tfMPTCanTrade = 0x00000010)
    canClawback?: boolean;       // Permite resgatar tokens (tfMPTCanClawback = 0x00000040)
  };
  /** Network (testnet, mainnet, devnet) */
  network?: XRPLNetwork;
}

/**
 * Interface para autorizar um holder a receber MPT
 */
export interface AuthorizeMPTHolderParams {
  /** Endereço do holder que será autorizado */
  holderAddress: string;
  /** MPTokenIssuanceID (hex) do token - OPCIONAL se currency e issuer forem fornecidos */
  mptokenIssuanceID?: string;
  /** Currency do token (alternativa ao MPTokenIssuanceID) */
  currency?: string;
  /** Issuer do token (alternativa ao MPTokenIssuanceID) */
  issuer?: string;
  /** Seed do holder (holder precisa autorizar-se) */
  holderSeed: string;
  /** Autorizar (true) ou desautorizar (false) */
  authorize?: boolean;
  /** Network */
  network?: XRPLNetwork;
}

/**
 * Interface para enviar MPT
 */
export interface SendMPTParams {
  /** Endereço de origem */
  fromAddress: string;
  /** Seed da carteira de origem */
  fromSeed: string;
  /** Endereço de destino */
  toAddress: string;
  /** MPTokenIssuanceID (hex) do token */
  mptokenIssuanceID: string;
  /** Quantidade a enviar (string) */
  amount: string;
  /** Memo opcional */
  memo?: string;
  /** Network */
  network?: XRPLNetwork;
}

/**
 * Converte flags para número inteiro
 */
function flagsToInt(flags?: CreateMPTParams['flags']): number {
  if (!flags) return 0;

  let result = 0;
  if (flags.canLock) result |= 0x00000002;
  if (flags.requireAuth) result |= 0x00000004;
  if (flags.canEscrow) result |= 0x00000008;
  if (flags.canTrade) result |= 0x00000010;
  if (flags.canTransfer) result |= 0x00000020;
  if (flags.canClawback) result |= 0x00000040;

  return result;
}

/**
 * Converte metadados para formato hex
 */
function metadataToHex(metadata: Record<string, any>): string {
  const json = JSON.stringify(metadata);
  return Buffer.from(json, 'utf-8').toString('hex').toUpperCase();
}

/**
 * Cria um novo MPT (Multi-Purpose Token)
 * 
 * @param params - Parâmetros do MPT
 * @returns Objeto com MPTokenIssuanceID e hash da transação
 * 
 * @example
 * ```typescript
 * const result = await createMPT({
 *   issuerAddress: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
 *   issuerSeed: 'sXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
 *   assetScale: 2, // 2 casas decimais
 *   maximumAmount: '1000000', // 1 milhão de tokens
 *   metadata: {
 *     name: 'LAND Token',
 *     symbol: 'LAND',
 *     description: 'Tokenized land parcel'
 *   },
 *   flags: {
 *     requireAuth: true,
 *     canTransfer: true,
 *     canTrade: true
 *   },
 *   network: 'testnet'
 * });
 * 
 * console.log('MPTokenIssuanceID:', result.mptokenIssuanceID);
 * console.log('Transaction Hash:', result.txHash);
 * ```
 */
export async function createMPT(params: CreateMPTParams): Promise<{
  mptokenIssuanceID: string;
  txHash: string;
  currency?: string | null;
  ticker?: string | null;
  metadata?: MPTokenMetadata;
  tokenType?: MPTTokenType;
  result: any;
}> {
  const {
    issuerAddress,
    issuerSeed,
    assetScale = 0,
    maximumAmount = '0',
    transferFee = 0,
    metadata,
    tokenType,
    metadataOverrides,
    flags,
    network = 'testnet'
  } = params;

  // Validações
  if (!issuerAddress || !issuerAddress.startsWith('r')) {
    throw new Error('issuerAddress inválido');
  }

  if (!issuerSeed) {
    throw new Error('issuerSeed é obrigatório');
  }

  // Criar wallet
  const wallet = Wallet.fromSeed(issuerSeed);
  if (wallet.classicAddress !== issuerAddress && wallet.address !== issuerAddress) {
    throw new Error('issuerSeed não corresponde ao issuerAddress');
  }

  // Obter client
  const client = await xrplPool.getClient(network);

  // Construir transação
  const transaction: Record<string, any> = {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: issuerAddress,
    AssetScale: assetScale,
    MaximumAmount: maximumAmount,
    TransferFee: transferFee,
  };

  // Adicionar flags
  const flagsValue = flagsToInt(flags);
  if (flagsValue > 0) {
    transaction.Flags = flagsValue;
  }

  // Adicionar metadados
  const resolvedMetadata: MPTokenMetadata | undefined =
    metadata ?? (tokenType ? buildDefaultMetadata(tokenType, metadataOverrides) : undefined);

  if (resolvedMetadata) {
    transaction.MPTokenMetadata = metadataToHex(resolvedMetadata);
    transaction.Memos = [buildMetadataMemo(resolvedMetadata)];
  }

  // Autofill (adiciona Fee, Sequence, etc)
  const prepared = await client.autofill(transaction);

  // Assinar
  const signed = wallet.sign(prepared);

  // Submeter
  const rs = new ReliableSubmission(network);
  const result = await rs.submitAndWait(signed.tx_blob);

  // Verificar resultado
  const txResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;
  if (txResult && !txResult.startsWith('tes')) {
    throw new Error(`Transação falhou: ${txResult}`);
  }

  // Extrair MPTokenIssuanceID do meta
  let mptokenIssuanceID: string | undefined;
  const meta = result.result.meta;

  if (meta && typeof meta === 'object') {
    // Tentar extrair o MPTokenIssuanceID (ID oficial de 48 chars/192 bits)
    mptokenIssuanceID = (meta as any).MPTokenIssuanceID || (meta as any).mpt_issuance_id;

    // Se não encontrou, buscar nos nós afetados
    if (!mptokenIssuanceID && (meta as any).AffectedNodes) {
      for (const node of (meta as any).AffectedNodes || []) {
        if (node.CreatedNode?.LedgerEntryType === 'MPTokenIssuance') {
          mptokenIssuanceID =
            node.CreatedNode?.NewFields?.MPTokenIssuanceID ||
            node.CreatedNode?.NewFields?.mpt_issuance_id ||
            node.CreatedNode?.LedgerIndex; // Fallback para o index (64 chars)
          break;
        }
      }
    }
  }

  const txHash = result.result.tx_json?.hash || (result.result as any).hash;

  if (!mptokenIssuanceID) {
    console.warn('[createMPT] MPTokenIssuanceID não encontrado no meta. Meta:', JSON.stringify(meta, null, 2));
    // Tentar buscar na transação como um todo
    mptokenIssuanceID = (result.result as any).MPTokenIssuanceID || (result.result as any).mpt_issuance_id;
  }

  // const txHash = result.result.tx_json?.hash || (result.result as any).hash;  // Removido declaração duplicada

  if (!mptokenIssuanceID) {
    throw new Error('Não foi possível extrair MPTokenIssuanceID da resposta. Verifique o meta da transação.');
  }

  let currency: string | null | undefined = null;
  try {
    const ledgerEntry = await client.request({
      command: 'ledger_entry',
      mpt_issuance_id: mptokenIssuanceID,
      ledger_index: 'validated',
    });
    const node = (ledgerEntry.result.node as any) ?? (ledgerEntry.result as any).MPTokenIssuance ?? ledgerEntry.result;
    currency = node?.Currency ?? null;
  } catch (ledgerError) {
    console.warn('[createMPT] Falha ao obter informações do MPT recém emitido:', ledgerError);
  }

  return {
    mptokenIssuanceID,
    txHash,
    currency,
    ticker: currency ?? (resolvedMetadata?.t as string | undefined) ?? null,
    metadata: resolvedMetadata,
    tokenType,
    result: result.result,
  };
}

/**
 * Autoriza um holder a receber MPT
 * 
 * IMPORTANTE: O HOLDER precisa chamar esta função, não o issuer!
 * É como "aceitar" o token.
 * 
 * @param params - Parâmetros de autorização
 * @returns Hash da transação
 * 
 * @example
 * ```typescript
 * // Holder autoriza a si mesmo para receber o MPT
 * const txHash = await authorizeMPTHolder({
 *   holderAddress: 'rHolderXXXXXXXXXXXXXXXXXXXXXXX',
 *   holderSeed: 'sHolderXXXXXXXXXXXXXXXXXXXXXXX',
 *   mptokenIssuanceID: '00000A1B2C3D4E5F...',
 *   authorize: true,
 *   network: 'testnet'
 * });
 * ```
 */
export async function authorizeMPTHolder(params: AuthorizeMPTHolderParams): Promise<string> {
  const {
    holderAddress,
    mptokenIssuanceID,
    currency,
    issuer,
    holderSeed,
    authorize = true,
    network = 'testnet'
  } = params;

  // Validações
  if (!holderAddress || !holderAddress.startsWith('r')) {
    throw new Error('holderAddress inválido');
  }

  if (!holderSeed) {
    throw new Error('holderSeed é obrigatório');
  }

  // Validar que temos identificação do token (MPTokenIssuanceID OU Currency+Issuer)
  const hasMPTokenIssuanceID = !!mptokenIssuanceID;
  const hasCurrencyIssuer = !!(currency && issuer);

  if (!hasMPTokenIssuanceID && !hasCurrencyIssuer) {
    throw new Error('É obrigatório fornecer MPTokenIssuanceID OU (Currency + Issuer)');
  }

  // Criar wallet
  const wallet = Wallet.fromSeed(holderSeed);
  if (wallet.classicAddress !== holderAddress && wallet.address !== holderAddress) {
    throw new Error('holderSeed não corresponde ao holderAddress');
  }

  // Obter client
  const client = await xrplPool.getClient(network);

  // Construir transação MPTokenAuthorize
  // IMPORTANTE: Account é o holder, não o issuer!
  const transaction: Record<string, any> = {
    TransactionType: 'MPTokenAuthorize',
    Account: holderAddress, // Holder autoriza a si mesmo
    Holder: holderAddress,  // Holder também precisa estar aqui
  };

  // Resolver ID (converter 64-char index para 48-char ID se necessário)
  const cleanedID = await resolveMPTID(mptokenIssuanceID!, network);

  // Adicionar identificação do token
  if (hasMPTokenIssuanceID) {
    // Validar formato (48 ou 64 caracteres hex)
    if (cleanedID.length !== 64 && cleanedID.length !== 48) {
      throw new Error(`MPTokenIssuanceID inválido. Esperado 48 ou 64 caracteres hex, recebido: ${cleanedID.length}`);
    }
    transaction.MPTokenIssuanceID = cleanedID.toUpperCase();
  } else {
    // Usar Currency + Issuer
    transaction.Currency = currency!.toUpperCase();
    transaction.Issuer = issuer;
  }

  // Se desautorizar, adicionar flag
  if (!authorize) {
    transaction.Flags = 0x00000001; // tfMPTUnauthorize
  }

  // Autofill
  const prepared = await client.autofill(transaction);

  // Assinar
  const signed = wallet.sign(prepared);

  // Submeter
  const rs = new ReliableSubmission(network);
  const result = await rs.submitAndWait(signed.tx_blob);

  // Verificar resultado
  const txResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;
  if (txResult && !txResult.startsWith('tes')) {
    throw new Error(`Transação falhou: ${txResult}`);
  }

  const txHash = result.result.tx_json?.hash || (result.result as any).hash;
  return txHash;
}

/**
 * Tenta enviar faucet para um endereço silenciosamente.
 * Se falhar, ignora o erro e retorna false.
 * Usado para garantir que contas de destino tenham fundos antes de receber MPTs.
 * 
 * @param address - Endereço XRPL para receber faucet
 * @param network - Rede (testnet ou devnet)
 * @returns true se sucesso, false se falhou (silenciosamente)
 */
export async function trySendFaucet(
  address: string,
  network: 'testnet' | 'devnet'
): Promise<boolean> {
  const faucetUrls: Record<string, string> = {
    testnet: 'https://faucet.altnet.rippletest.net/accounts',
    devnet: 'https://faucet.devnet.rippletest.net/accounts',
  };

  const faucetUrl = faucetUrls[network];
  if (!faucetUrl) {
    console.log(`[trySendFaucet] Rede ${network} não suporta faucet`);
    return false;
  }

  try {
    console.log(`[trySendFaucet] Enviando faucet para ${address} na ${network}...`);

    const response = await fetch(faucetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: address,
        xrpAmount: '100', // Valor menor para ser mais rápido
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[trySendFaucet] Faucet falhou (${response.status}): ${errorText.slice(0, 100)}`);
      return false;
    }

    const data = await response.json();
    console.log(`[trySendFaucet] Faucet enviado com sucesso:`, data.amount || '100 XRP');

    // Aguardar um pouco para o faucet ser processado
    await new Promise(resolve => setTimeout(resolve, 2000));

    return true;
  } catch (error: any) {
    console.log(`[trySendFaucet] Erro silencioso:`, error.message);
    return false;
  }
}

/**
 * Envia MPT de uma conta para outra
 * 
 * IMPORTANTE: Ambas as contas devem ter autorizado o MPT primeiro!
 * E o MPT deve ter a flag canTransfer ativada.
 * 
 * @param params - Parâmetros de envio
 * @returns Hash da transação
 * 
 * @example
 * ```typescript
 * const txHash = await sendMPT({
 *   fromAddress: 'rFromXXXXXXXXXXXXXXXXXXXXXXXXX',
 *   fromSeed: 'sFromXXXXXXXXXXXXXXXXXXXXXXXXX',
 *   toAddress: 'rToXXXXXXXXXXXXXXXXXXXXXXXXXXX',
 *   mptokenIssuanceID: '00000A1B2C3D4E5F...',
 *   amount: '100',
 *   memo: 'Payment for land',
 *   network: 'testnet'
 * });
 * ```
 */
export async function sendMPT(params: SendMPTParams): Promise<string> {
  const {
    fromAddress,
    fromSeed,
    toAddress,
    mptokenIssuanceID,
    amount,
    memo,
    network = 'testnet'
  } = params;

  // Validações
  if (!fromAddress || !fromAddress.startsWith('r')) {
    throw new Error('fromAddress inválido');
  }

  if (!toAddress || !toAddress.startsWith('r')) {
    throw new Error('toAddress inválido');
  }

  if (!mptokenIssuanceID) {
    throw new Error('mptokenIssuanceID é obrigatório');
  }

  // Resolver ID (converter 64-char index para 48-char ID se necessário)
  const cleanedID = await resolveMPTID(mptokenIssuanceID, network);
  if (cleanedID.length !== 64 && cleanedID.length !== 48) {
    throw new Error(`MPTokenIssuanceID inválido. Esperado 48 ou 64 caracteres hex, recebido: ${cleanedID.length}`);
  }

  if (!amount || parseFloat(amount) <= 0) {
    throw new Error('amount inválido');
  }

  if (!fromSeed) {
    throw new Error('fromSeed é obrigatório');
  }

  // Criar wallet
  const wallet = Wallet.fromSeed(fromSeed);
  if (wallet.classicAddress !== fromAddress && wallet.address !== fromAddress) {
    throw new Error('fromSeed não corresponde ao fromAddress');
  }

  // Tentar enviar faucet para o destino antes de transferir
  // Isso garante que a conta destino exista e tenha fundos
  // Se falhar, ignoramos silenciosamente e continuamos
  if (network === 'testnet' || network === 'devnet') {
    console.log('[sendMPT] Tentando enviar faucet para destino antes da transferência...');
    await trySendFaucet(toAddress, network);
  }

  // Obter client
  const client = await xrplPool.getClient(network);

  console.log('[sendMPT] Iniciando transferência MPT...');
  console.log('[sendMPT] De:', fromAddress);
  console.log('[sendMPT] Para:', toAddress);
  console.log('[sendMPT] MPT ID:', cleanedID.toUpperCase());
  console.log('[sendMPT] Quantidade:', amount);

  // WORKAROUND: A biblioteca xrpl.js v4.x não suporta serialização de mpt_issuance_id
  // Vamos tentar múltiplas abordagens

  // Abordagem 1: Tentar usar o formato com MPTokenIssuanceID (campo oficial)
  // Segundo a documentação, para MPT Payments o Amount deve ter mpt_issuance_id
  // Mas a biblioteca não serializa corretamente. Vamos tentar com submit direto.

  // Primeiro, obtemos as informações da conta para sequence e fee
  const accountInfo = await client.request({
    command: 'account_info',
    account: fromAddress,
    ledger_index: 'validated',
  });

  const sequence = accountInfo.result.account_data.Sequence;

  // Obter fee sugerido
  const feeResponse = await client.request({
    command: 'fee',
  });
  const baseFee = feeResponse.result.drops.base_fee || '12';

  // Obter ledger atual
  const ledgerResponse = await client.request({
    command: 'ledger_current',
  });
  const currentLedger = ledgerResponse.result.ledger_current_index;

  // Construir transação base (comum)
  const baseTransaction: Record<string, any> = {
    TransactionType: 'Payment',
    Account: fromAddress,
    Destination: toAddress,
    Amount: {
      mpt_issuance_id: cleanedID.toUpperCase(),
      value: amount,
    },
    Fee: baseFee,
    Sequence: sequence,
    LastLedgerSequence: currentLedger + 20,
  };

  if (memo) {
    const memoData = Buffer.from(memo, 'utf-8').toString('hex').toUpperCase();
    baseTransaction.Memos = [
      {
        Memo: {
          MemoData: memoData,
        },
      },
    ];
  }

  // Tentar assinar com xrpl.js (pode falhar)
  try {
    const signed = wallet.sign(baseTransaction);
    console.log('[sendMPT] Transação assinada com sucesso localmente via xrpl.js');

    const result = await client.submitAndWait(signed.tx_blob);
    const txResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;

    if (txResult && !txResult.startsWith('tes')) {
      // Se falhou no ledger, mas a assinatura foi válida, lançamos erro específico
      throw new Error(`Erro na execução do Ledger: ${txResult}`);
    }

    const txHash = result.result.tx_json?.hash || (result.result as any).hash;
    console.log('[sendMPT] Transferência concluída! Hash:', txHash);
    return txHash;

  } catch (signError: any) {
    if (signError.message.includes('Erro na execução do Ledger')) {
      console.warn('[sendMPT] xrpl.js submeteu, mas o Ledger rejeitou:', signError.message);
    } else {
      console.warn('[sendMPT] xrpl.js falhou ao assinar/preparar (provável falta de suporte a MPT):', signError.message);
    }

    // FALLBACK: Submit direto com secret
    // Tentamos variantes do campo Amount caso o servidor seja exigente
    console.log('[sendMPT] Tentando fallback via submit com secret...');

    const amountVariants = [
      { mpt_issuance_id: cleanedID.toUpperCase(), value: amount }, // Case 1: Standard snake_case
      { mpt_issuance_id: cleanedID.toUpperCase(), value: parseFloat(amount) }, // Case 2: Numeric value
      { mpt_issuance_id: cleanedID.toUpperCase(), Value: amount }, // Case 3: PascalCase Value
      { MPTokenIssuanceID: cleanedID.toUpperCase(), value: amount }, // Case 4: PascalCase ID
    ];

    let lastError: any;

    for (const amountVariant of amountVariants) {
      try {
        console.log('[sendMPT] Tentando variante:', JSON.stringify(amountVariant));

        // Removemos Fee e Sequence para deixar o servidor preencher (menos chance de erro)
        const fallbackTx: any = {
          ...baseTransaction,
          Amount: amountVariant,
        };
        delete fallbackTx.Fee;
        delete fallbackTx.Sequence;
        delete fallbackTx.LastLedgerSequence;

        const submitResult = await client.request({
          command: 'submit',
          tx_json: fallbackTx,
          secret: fromSeed,
        } as any);

        const engineResult = submitResult.result.engine_result;
        console.log('[sendMPT] Resultado do submit:', engineResult, submitResult.result.engine_result_message);

        if (engineResult && !engineResult.startsWith('tes') && !engineResult.startsWith('terQUEUED')) {
          // Se falhou, continua para proxima variante
          throw new Error(`Engine Result: ${engineResult} - ${submitResult.result.engine_result_message}`);
        }

        const txHash = submitResult.result.tx_json?.hash || (submitResult.result as any).hash;
        console.log('[sendMPT] Transferência via fallback concluída! Hash:', txHash);

        // Aguardar validação se necessário
        if (engineResult === 'terQUEUED' || engineResult === 'tesSUCCESS') {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        return txHash;

      } catch (submitError: any) {
        console.warn('[sendMPT] Falha na variante:', submitError.message);
        lastError = submitError;
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    console.error('[sendMPT] Todas as tentativas de fallback falharam.');
    throw new Error(
      `Não foi possível transferir MPT via ServiceWallet. Erro: ${lastError?.message || 'Erro desconhecido'}.`
    );
  }
}

/**
 * Busca informações de um MPT pelo MPTokenIssuanceID
 */
export async function getMPTInfo(
  mptokenIssuanceID: string,
  network: XRPLNetwork = 'testnet'
): Promise<any> {
  const client = await xrplPool.getClient(network);

  const response = await client.request({
    command: 'ledger_entry',
    mpt_issuance_id: mptokenIssuanceID,
    ledger_index: 'validated',
  });

  return response.result;
}

/**
 * Verifica se um holder está autorizado para um MPT
 */
export async function isHolderAuthorized(
  holderAddress: string,
  mptokenIssuanceID: string,
  network: XRPLNetwork = 'testnet'
): Promise<boolean> {
  try {
    const client = await xrplPool.getClient(network);

    // Resolver ID
    const cleanedID = await resolveMPTID(mptokenIssuanceID, network);

    // Buscar objetos da conta holder (MPTokens são LedgerEntryType 'MPToken')
    const response = await client.request({
      command: 'account_objects',
      account: holderAddress,
      ledger_index: 'validated',
    });

    // Verificar se existe objeto MPToken para este issuance
    const mptObjects = response.result.account_objects || [];
    return mptObjects.some((obj: any) =>
      obj.LedgerEntryType === 'MPToken' &&
      (obj.MPTokenIssuanceID === cleanedID || obj.mpt_issuance_id === cleanedID)
    );
  } catch (error) {
    console.error('Erro ao verificar autorização do holder:', error);
    return false;
  }
}

/**
 * Busca saldo de MPT de um holder
 */
export async function getMPTBalance(
  holderAddress: string,
  mptokenIssuanceID: string,
  network: XRPLNetwork = 'testnet'
): Promise<string> {
  try {
    const client = await xrplPool.getClient(network);

    // Resolver ID
    const cleanedID = await resolveMPTID(mptokenIssuanceID, network);

    const response = await client.request({
      command: 'account_objects',
      account: holderAddress,
      ledger_index: 'validated',
    });

    const mptObjects = response.result.account_objects || [];
    const mptObject = mptObjects.find((obj: any) =>
      obj.LedgerEntryType === 'MPToken' &&
      (obj.MPTokenIssuanceID === cleanedID || obj.mpt_issuance_id === cleanedID)
    );

    return mptObject?.MPTAmount || '0';
  } catch (error) {
    console.error('Erro ao buscar saldo MPT:', error);
    return '0';
  }
}

export interface FreezeMPTParams {
  issuerAddress: string;
  issuerSeed: string;
  currency: string;
  holderAddress: string;
  freeze?: boolean;
  network?: XRPLNetwork;
}

export async function freezeMPT(params: FreezeMPTParams): Promise<string> {
  const {
    issuerAddress,
    issuerSeed,
    currency,
    holderAddress,
    freeze = true,
    network = 'testnet',
  } = params;

  if (!issuerAddress || !issuerAddress.startsWith('r')) {
    throw new Error('issuerAddress inválido');
  }

  if (!issuerSeed) {
    throw new Error('issuerSeed é obrigatório');
  }

  if (!currency) {
    throw new Error('currency é obrigatório');
  }

  if (!holderAddress || !holderAddress.startsWith('r')) {
    throw new Error('holderAddress inválido');
  }

  const wallet = Wallet.fromSeed(issuerSeed);
  if (wallet.classicAddress !== issuerAddress && wallet.address !== issuerAddress) {
    throw new Error('issuerSeed não corresponde ao issuerAddress');
  }

  const client = await xrplPool.getClient(network);

  const transaction: Record<string, any> = {
    TransactionType: 'MPTokenFreeze',
    Account: issuerAddress,
    Currency: currency.toUpperCase(),
    Holder: holderAddress,
    Freeze: freeze,
  };

  const prepared = await client.autofill(transaction);
  const signed = wallet.sign(prepared);
  const rs = new ReliableSubmission(network);
  const result = await rs.submitAndWait(signed.tx_blob);

  const txResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;
  if (txResult && !txResult.startsWith('tes')) {
    throw new Error(`Transação falhou: ${txResult}`);
  }

  return result.result.tx_json?.hash || (result.result as any).hash;
}

export interface ClawbackMPTParams {
  issuerAddress: string;
  issuerSeed: string;
  currency: string;
  holderAddress: string;
  amount: string;
  network?: XRPLNetwork;
}

export async function clawbackMPT(params: ClawbackMPTParams): Promise<string> {
  const {
    issuerAddress,
    issuerSeed,
    currency,
    holderAddress,
    amount,
    network = 'testnet',
  } = params;

  if (!issuerAddress || !issuerAddress.startsWith('r')) {
    throw new Error('issuerAddress inválido');
  }

  if (!issuerSeed) {
    throw new Error('issuerSeed é obrigatório');
  }

  if (!currency) {
    throw new Error('currency é obrigatório');
  }

  if (!holderAddress || !holderAddress.startsWith('r')) {
    throw new Error('holderAddress inválido');
  }

  if (!amount) {
    throw new Error('amount é obrigatório');
  }

  const wallet = Wallet.fromSeed(issuerSeed);
  if (wallet.classicAddress !== issuerAddress && wallet.address !== issuerAddress) {
    throw new Error('issuerSeed não corresponde ao issuerAddress');
  }

  const client = await xrplPool.getClient(network);

  const transaction: Record<string, any> = {
    TransactionType: 'MPTokenClawback',
    Account: issuerAddress,
    Currency: currency.toUpperCase(),
    Holder: holderAddress,
    Amount: amount,
  };

  const prepared = await client.autofill(transaction);
  const signed = wallet.sign(prepared);
  const rs = new ReliableSubmission(network);
  const result = await rs.submitAndWait(signed.tx_blob);

  const txResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;
  if (txResult && !txResult.startsWith('tes')) {
    throw new Error(`Transação falhou: ${txResult}`);
  }

  return result.result.tx_json?.hash || (result.result as any).hash;
}

/**
 * Interface para mintar MPT diretamente para um holder (investidor)
 */
export interface MintMPTToHolderParams {
  /** Endereço do issuer (emissor do token) */
  issuerAddress: string;
  /** Seed da carteira emissora */
  issuerSeed: string;
  /** Endereço do holder que receberá os tokens */
  holderAddress: string;
  /** MPTokenIssuanceID (hex) do token */
  mptokenIssuanceID: string;
  /** Quantidade a mintar */
  amount: string;
  /** Memo opcional (ex: "Investimento: Projeto X - R$ 100") */
  memo?: string;
  tokenType?: 'land' | 'build' | 'rev' | 'col';
  network?: XRPLNetwork;
}

/**
 * Resolve um MPTokenIssuanceID. 
 * Se for 64 chars (LedgerIndex), tenta buscar o ID real de 48 chars (XLS-33).
 */
export async function resolveMPTID(
  mptokenIssuanceID: string,
  network: XRPLNetwork = 'testnet'
): Promise<string> {
  const cleaned = mptokenIssuanceID.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();

  // Se já tem 48 chars (192 bits), é o formato esperado para MPT IDs
  if (cleaned.length === 48) return cleaned;

  // Se tem 64 chars (256 bits), pode ser o LedgerIndex (index no banco de dados)
  if (cleaned.length === 64) {
    try {
      console.log(`[resolveMPTID] Tentando resolver LedgerIndex ${cleaned} para ID de 48 chars...`);
      const client = await xrplPool.getClient(network);
      const response = await client.request({
        command: 'ledger_entry',
        index: cleaned,
        ledger_index: 'validated'
      });

      const node = response.result.node as any;
      if (node && node.LedgerEntryType === 'MPTokenIssuance') {
        const realID = node.mpt_issuance_id || node.MPTokenIssuanceID;
        if (realID) {
          const cleanedReal = realID.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
          console.log(`[resolveMPTID] Resolvido ${cleaned} -> ${cleanedReal}`);
          return cleanedReal;
        }
      }
    } catch (e: any) {
      console.warn(`[resolveMPTID] Não foi possível resolver ${cleaned} via ledger_entry:`, e.message);
    }
  }

  return cleaned;
}

/**
 * Minta MPT diretamente para um holder (investidor)
 * 
 * Esta função permite ao issuer criar novos tokens diretamente na carteira
 * do investidor, sem precisar ter tokens "em estoque". É o fluxo ideal
 * para quando alguém investe: os tokens são criados sob demanda.
 * 
 * @param params - Parâmetros de mintagem
 * @returns Hash da transação
 */
export async function mintMPTToHolder(params: MintMPTToHolderParams): Promise<string> {
  const {
    issuerAddress,
    issuerSeed,
    holderAddress,
    mptokenIssuanceID,
    amount,
    memo,
    network = 'testnet'
  } = params;

  // Validações
  if (!issuerAddress || !issuerAddress.startsWith('r')) {
    throw new Error('issuerAddress inválido');
  }

  if (!holderAddress || !holderAddress.startsWith('r')) {
    throw new Error('holderAddress inválido');
  }

  if (!mptokenIssuanceID) {
    throw new Error('mptokenIssuanceID é obrigatório');
  }

  // Resolver ID
  const cleanedID = await resolveMPTID(mptokenIssuanceID, network);
  if (cleanedID.length !== 64 && cleanedID.length !== 48) {
    throw new Error(`MPTokenIssuanceID inválido. Esperado 48 ou 64 caracteres hex, recebido: ${cleanedID.length}`);
  }

  if (!amount || parseFloat(amount) <= 0) {
    throw new Error('amount inválido');
  }

  if (!issuerSeed) {
    throw new Error('issuerSeed é obrigatório');
  }

  // Criar wallet do issuer
  const wallet = Wallet.fromSeed(issuerSeed);
  if (wallet.classicAddress !== issuerAddress && wallet.address !== issuerAddress) {
    throw new Error('issuerSeed não corresponde ao issuerAddress');
  }

  // Tentar enviar faucet para o destino antes de transferir
  if (network === 'testnet' || network === 'devnet') {
    console.log('[mintMPTToHolder] Tentando enviar faucet para destino...');
    await trySendFaucet(holderAddress, network);
  }

  // Obter client
  const client = await xrplPool.getClient(network);

  console.log('[mintMPTToHolder] Iniciando mint de MPT...');
  console.log('[mintMPTToHolder] Issuer:', issuerAddress);
  console.log('[mintMPTToHolder] Para:', holderAddress);
  console.log('[mintMPTToHolder] MPT ID:', cleanedID.toUpperCase());
  console.log('[mintMPTToHolder] Quantidade:', amount);

  // Obter informações da conta para sequence e fee
  const accountInfo = await client.request({
    command: 'account_info',
    account: issuerAddress,
    ledger_index: 'validated',
  });

  const sequence = accountInfo.result.account_data.Sequence;

  // Obter fee sugerido
  const feeResponse = await client.request({
    command: 'fee',
  });
  const baseFee = feeResponse.result.drops.base_fee || '12';

  // Obter ledger atual
  const ledgerResponse = await client.request({
    command: 'ledger_current',
  });
  const currentLedger = ledgerResponse.result.ledger_current_index;

  // Construir transação Payment (MPT mint é essencialmente um Payment do issuer)
  // IMPORTANTE: Para MPT, o Amount deve ser exatamente { mpt_issuance_id, value }
  const transaction: Record<string, any> = {
    TransactionType: 'Payment',
    Account: issuerAddress,
    Destination: holderAddress,
    Amount: {
      mpt_issuance_id: cleanedID.toUpperCase(),
      value: amount,
    },
    Fee: baseFee,
    Sequence: sequence,
    LastLedgerSequence: currentLedger + 20,
  };

  // Adicionar memo se fornecido
  if (memo) {
    const memoData = Buffer.from(memo, 'utf-8').toString('hex').toUpperCase();
    transaction.Memos = [
      {
        Memo: {
          MemoData: memoData,
          MemoType: Buffer.from('investment', 'utf-8').toString('hex').toUpperCase(),
        },
      },
    ];
  }

  // Tentar assinar e submeter
  try {
    const signed = wallet.sign(transaction);
    console.log('[mintMPTToHolder] Transação assinada com sucesso');

    const result = await client.submitAndWait(signed.tx_blob);
    const txResult = result.result.meta?.TransactionResult || (result.result as any).engine_result;

    if (txResult && !txResult.startsWith('tes')) {
      throw new Error(`Transação falhou: ${txResult}`);
    }

    const txHash = result.result.tx_json?.hash || (result.result as any).hash;
    console.log('[mintMPTToHolder] Mint concluído! Hash:', txHash);
    return txHash;

  } catch (signError: any) {
    console.warn('[mintMPTToHolder] xrpl.js falhou ao assinar - tentando fallback:', signError.message);

    const amountVariants = [
      { mpt_issuance_id: cleanedID.toUpperCase(), value: amount },
      { mpt_issuance_id: cleanedID.toUpperCase(), value: parseFloat(amount) },
      { mpt_issuance_id: cleanedID.toUpperCase(), Value: amount },
      { MPTokenIssuanceID: cleanedID.toUpperCase(), value: amount },
    ];

    let lastError: any;

    for (const amountVariant of amountVariants) {
      try {
        console.log('[mintMPTToHolder] Tentando variante:', JSON.stringify(amountVariant));

        const fallbackTx: any = {
          ...transaction,
          Amount: amountVariant,
        };
        // Deixar servidor preencher taxas no fallback
        delete fallbackTx.Fee;
        delete fallbackTx.Sequence;
        delete fallbackTx.LastLedgerSequence;

        const submitResult = await client.request({
          command: 'submit',
          tx_json: fallbackTx,
          secret: issuerSeed,
        } as any);

        const engineResult = submitResult.result.engine_result;
        console.log('[mintMPTToHolder] Resultado submit:', engineResult);

        if (engineResult && !engineResult.startsWith('tes') && !engineResult.startsWith('terQUEUED')) {
          throw new Error(`Engine Result: ${engineResult}`);
        }

        const txHash = submitResult.result.tx_json?.hash || (submitResult.result as any).hash;
        console.log('[mintMPTToHolder] Mint via fallback concluído! Hash:', txHash);

        if (engineResult === 'terQUEUED') {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        return txHash;
      } catch (e: any) {
        console.warn('[mintMPTToHolder] Falha variante:', e.message);
        lastError = e;
      }
    }

    throw new Error(`Mint falhou em todas as tentativas. Erro: ${lastError?.message}`);
  }
}
