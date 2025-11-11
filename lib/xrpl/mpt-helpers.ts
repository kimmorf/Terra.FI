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

import { Client, Wallet } from 'xrpl';
import { xrplPool, type XRPLNetwork } from './pool';
import { ReliableSubmission } from './reliable-submission';

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
  metadata?: {
    name: string;
    symbol?: string;
    description?: string;
    image?: string;
    [key: string]: any;
  };
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
  result: any;
}> {
  const {
    issuerAddress,
    issuerSeed,
    assetScale = 0,
    maximumAmount = '0',
    transferFee = 0,
    metadata,
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
  if (metadata) {
    transaction.MPTokenMetadata = metadataToHex(metadata);
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
    // Tentar extrair diretamente
    mptokenIssuanceID = (meta as any).MPTokenIssuanceID;
    
    // Se não encontrou, buscar em AffectedNodes
    if (!mptokenIssuanceID && (meta as any).AffectedNodes) {
      for (const node of (meta as any).AffectedNodes || []) {
        if (node.CreatedNode?.LedgerEntryType === 'MPTokenIssuance') {
          mptokenIssuanceID = 
            node.CreatedNode?.NewFields?.MPTokenIssuanceID ||
            node.CreatedNode?.LedgerIndex;
          break;
        }
      }
    }
  }

  if (!mptokenIssuanceID) {
    console.warn('MPTokenIssuanceID não encontrado no meta. Meta:', JSON.stringify(meta, null, 2));
    // Tentar extrair do index do ledger entry criado
    if (meta && (meta as any).AffectedNodes) {
      for (const node of (meta as any).AffectedNodes || []) {
        if (node.CreatedNode?.LedgerEntryType === 'MPTokenIssuance') {
          mptokenIssuanceID = node.CreatedNode?.LedgerIndex;
          break;
        }
      }
    }
  }

  const txHash = result.result.tx_json?.hash || (result.result as any).hash;

  if (!mptokenIssuanceID) {
    throw new Error('Não foi possível extrair MPTokenIssuanceID da resposta. Verifique o meta da transação.');
  }

  return {
    mptokenIssuanceID,
    txHash,
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

  // Adicionar identificação do token
  if (hasMPTokenIssuanceID) {
    // Validar formato do MPTokenIssuanceID (deve ser 64 caracteres hex)
    const cleanedID = mptokenIssuanceID!.replace(/[^0-9A-Fa-f]/g, '');
    if (cleanedID.length !== 64) {
      throw new Error(`MPTokenIssuanceID inválido. Esperado 64 caracteres hex, recebido: ${cleanedID.length}`);
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

  // Validar formato do MPTokenIssuanceID
  const cleanedID = mptokenIssuanceID.replace(/[^0-9A-Fa-f]/g, '');
  if (cleanedID.length !== 64) {
    throw new Error(`MPTokenIssuanceID inválido. Esperado 64 caracteres hex, recebido: ${cleanedID.length}`);
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

  // Obter client
  const client = await xrplPool.getClient(network);

  // Construir transação Payment com MPT
  // Formato do Amount para MPT: { mpt_issuance_id: "...", value: "..." }
  const transaction: Record<string, any> = {
    TransactionType: 'Payment',
    Account: fromAddress,
    Destination: toAddress,
    Amount: {
      mpt_issuance_id: cleanedID.toUpperCase(),
      value: amount,
    },
  };

  // Adicionar memo se fornecido
  if (memo) {
    const memoData = Buffer.from(memo, 'utf-8').toString('hex').toUpperCase();
    transaction.Memos = [
      {
        Memo: {
          MemoData: memoData,
        },
      },
    ];
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

    // Buscar objetos MPToken da conta holder
    const response = await client.request({
      command: 'account_objects',
      account: holderAddress,
      type: 'mpt', // Filtrar apenas MPTokens
      ledger_index: 'validated',
    });

    // Verificar se existe objeto MPToken para este issuance
    const mptObjects = response.result.account_objects || [];
    return mptObjects.some((obj: any) => 
      obj.LedgerEntryType === 'MPToken' && 
      obj.MPTokenIssuanceID === mptokenIssuanceID
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

    const response = await client.request({
      command: 'account_objects',
      account: holderAddress,
      type: 'mpt',
      ledger_index: 'validated',
    });

    const mptObjects = response.result.account_objects || [];
    const mptObject = mptObjects.find((obj: any) => 
      obj.LedgerEntryType === 'MPToken' && 
      obj.MPTokenIssuanceID === mptokenIssuanceID
    );

    return mptObject?.MPTAmount || '0';
  } catch (error) {
    console.error('Erro ao buscar saldo MPT:', error);
    return '0';
  }
}

