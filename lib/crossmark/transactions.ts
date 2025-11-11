'use client';

import { getCrossmarkSDK } from './sdk';
import type { MPTokenMetadata } from './types';
import { xrpToDrops, isValidXRPAmount } from '../utils/xrp-converter';

export interface MPTokenIssuanceParams {
  issuer: string;
  // Campos da especificação XRPL
  assetScale?: number; // 0-9, número de casas decimais (antigo: decimals)
  maximumAmount?: string; // Quantidade máxima, "0" = sem limite (antigo: amount)
  transferFee?: number; // Taxa de transferência em basis points (0-50000)
  // Metadados
  metadata?: MPTokenMetadata; // Será convertido para MPTokenMetadata (hex)
  // Flags de configuração
  flags?: {
    requireAuth?: boolean; // tfMPTRequireAuth (0x00000004)
    canTransfer?: boolean; // tfMPTCanTransfer (0x00000020)
    canLock?: boolean; // tfMPTCanLock (0x00000002)
    canEscrow?: boolean; // tfMPTCanEscrow (0x00000008)
    canTrade?: boolean; // tfMPTCanTrade (0x00000010)
    canClawback?: boolean; // tfMPTCanClawback (0x00000040)
  };
  // Compatibilidade: campos antigos (deprecated)
  /** @deprecated Use assetScale instead */
  decimals?: number;
  /** @deprecated Use maximumAmount instead */
  amount?: string;
  /** @deprecated Use flags.canTransfer instead */
  transferable?: boolean;
  /** @deprecated Use currency apenas para referência, não é enviado na transação */
  currency?: string;
}

export interface MPTokenAuthorizeParams {
  // Identificação do token (preferência: MPTokenIssuanceID)
  mptokenIssuanceID?: string; // Hex do MPTokenIssuanceID (recomendado)
  // OU identificação por Currency + Issuer (legado/compatibilidade)
  currency?: string;
  issuer?: string;
  // Dados da transação
  holder: string;
  authorize: boolean; // true = autorizar, false = desautorizar
  // Account que executa (pode ser issuer ou holder dependendo do caso)
  account?: string; // Se não fornecido, usa issuer
}

export interface MPTokenFreezeParams {
  issuer: string;
  currency: string;
  holder: string;
  freeze: boolean;
}

export interface MPTokenClawbackParams {
  issuer: string;
  currency: string;
  holder: string;
  amount: string;
}

export interface MPTPaymentParams {
  sender: string;
  destination: string;
  amount: string;
  currency: string;
  issuer: string;
  memo?: string;
}

export interface TrustSetParams {
  account: string;
  currency: string;
  issuer: string;
  limit?: string;
  flags?: number;
}

export function extractTransactionHash(response: unknown): string | null {
  if (!response || typeof response !== 'object') {
    console.warn('[extractTransactionHash] Response não é um objeto:', response);
    return null;
  }

  const obj = response as Record<string, any>;
  
  // Log da estrutura completa para debug (apenas em dev)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[extractTransactionHash] Estrutura completa da resposta:', obj);
  }

  // Tenta múltiplos caminhos possíveis na resposta da Crossmark
  // Baseado na estrutura real: { request: {...}, response: {...}, createdAt, resolvedAt }
  // E estrutura interna: response.response.data.result.hash
  const hash = 
    // Estrutura Crossmark SDK v0.4.0+ - caminhos mais profundos primeiro
    obj?.response?.response?.data?.hash ??
    obj?.response?.response?.data?.result?.hash ??
    obj?.response?.response?.data?.result?.tx_json?.hash ??
    obj?.response?.response?.hash ??
    obj?.response?.response?.result?.hash ??
    // Estrutura Crossmark SDK v0.4.0+ (response.data...)
    obj?.response?.data?.hash ??
    obj?.response?.data?.result?.hash ??
    obj?.response?.data?.result?.tx_json?.hash ??
    obj?.response?.data?.tx_json?.hash ??
    obj?.response?.hash ??
    obj?.response?.result?.hash ??
    // Estrutura direta (legado)
    obj?.data?.hash ??
    obj?.data?.result?.hash ??
    obj?.data?.result?.tx_json?.hash ??
    obj?.data?.tx_json?.hash ??
    obj?.data?.response?.hash ??
    obj?.data?.response?.result?.hash ??
    // Estrutura alternativa
    obj?.result?.hash ??
    obj?.hash ??
    // Se a resposta tem request/response aninhados
    obj?.request?.response?.data?.hash ??
    obj?.request?.response?.hash ??
    null;
  
  // Se não encontrou hash mas tem txBlob, log para debug
  if (!hash) {
    const txBlob = 
      obj?.response?.response?.data?.txBlob ??
      obj?.response?.data?.txBlob ??
      obj?.data?.txBlob ??
      obj?.txBlob;
    
    if (txBlob && typeof txBlob === 'string') {
      // Hash geralmente vem na resposta, se não vier pode ser calculado depois
      // ou buscado via tx() command na XRPL
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('[extractTransactionHash] txBlob encontrado, mas hash não encontrado na resposta');
      }
    }
  }

  if (!hash) {
    // Log detalhado para debug
    const debugInfo: any = {
      keys: Object.keys(obj),
      dataKeys: obj?.data ? Object.keys(obj.data) : null,
      responseKeys: obj?.response ? Object.keys(obj.response) : null,
      resultKeys: obj?.result ? Object.keys(obj.result) : null,
    };
    
    // Se tem response, explora mais
    if (obj?.response) {
      debugInfo.responseType = typeof obj.response;
      if (typeof obj.response === 'object') {
        debugInfo.responseKeys = Object.keys(obj.response);
        if (obj.response.data) {
          debugInfo.responseDataKeys = Object.keys(obj.response.data);
        }
        if (obj.response.result) {
          debugInfo.responseResultKeys = Object.keys(obj.response.result);
        }
      }
    }
    
    console.error('[extractTransactionHash] Hash não encontrado. Estrutura da resposta:', debugInfo);
    
    // Tenta extrair informações úteis para debug
    if (obj?.response) {
      console.error('[extractTransactionHash] Conteúdo de response:', obj.response);
    }
  }

  return hash;
}

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

/**
 * Converte flags para número inteiro
 */
function flagsToInt(flags?: MPTokenIssuanceParams['flags']): number {
  if (!flags) return 0;
  
  let result = 0;
  if (flags.requireAuth) result |= 0x00000004; // tfMPTRequireAuth
  if (flags.canTransfer) result |= 0x00000020; // tfMPTCanTransfer
  if (flags.canLock) result |= 0x00000002; // tfMPTCanLock
  if (flags.canEscrow) result |= 0x00000008; // tfMPTCanEscrow
  if (flags.canTrade) result |= 0x00000010; // tfMPTCanTrade
  if (flags.canClawback) result |= 0x00000040; // tfMPTCanClawback
  
  return result;
}

/**
 * Converte metadados para formato hex do MPTokenMetadata
 */
function metadataToHex(metadata: MPTokenMetadata): string {
  const json = JSON.stringify(metadata);
  return Buffer.from(json, 'utf-8').toString('hex').toUpperCase();
}

export function buildMPTokenIssuanceTransaction({
  issuer,
  assetScale,
  maximumAmount,
  transferFee,
  metadata,
  flags,
  // Compatibilidade com campos antigos
  decimals,
  amount,
  transferable,
}: MPTokenIssuanceParams) {
  // Usa campos novos ou fallback para antigos (compatibilidade)
  const finalAssetScale = assetScale ?? decimals ?? 0;
  const finalMaximumAmount = maximumAmount ?? amount ?? '0';
  const finalTransferFee = transferFee ?? 0;
  
  // Constrói flags
  let finalFlags = flagsToInt(flags);
  
  // Compatibilidade: se transferable foi passado, adiciona flag
  if (transferable !== undefined && transferable) {
    finalFlags |= 0x00000020; // tfMPTCanTransfer
  }
  
  const transaction: Record<string, unknown> = {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: issuer,
    AssetScale: finalAssetScale,
    MaximumAmount: finalMaximumAmount,
    TransferFee: finalTransferFee,
  };

  // Adiciona flags se houver
  if (finalFlags > 0) {
    transaction.Flags = finalFlags;
  }

  // Adiciona metadados (preferência: MPTokenMetadata, fallback: Memos)
  if (metadata) {
    // Usa campo dedicado MPTokenMetadata (mais eficiente)
    transaction.MPTokenMetadata = metadataToHex(metadata);
    
    // Também adiciona em Memos para compatibilidade/legado
    transaction.Memos = [buildMetadataMemo(metadata)];
  }

  return transaction;
}

export function buildMPTokenAuthorizeTransaction({
  mptokenIssuanceID,
  currency,
  issuer,
  holder,
  authorize,
  account,
}: MPTokenAuthorizeParams) {
  const transaction: Record<string, unknown> = {
    TransactionType: 'MPTokenAuthorize',
    Account: account ?? issuer ?? holder, // Account pode ser issuer ou holder
    Holder: holder,
  };

  // Preferência: usar MPTokenIssuanceID (padrão moderno)
  if (mptokenIssuanceID) {
    transaction.MPTokenIssuanceID = mptokenIssuanceID;
  } 
  // Fallback: usar Currency + Issuer (legado/compatibilidade)
  else if (currency && issuer) {
    transaction.Currency = currency.toUpperCase();
    transaction.Issuer = issuer;
  } else {
    throw new Error('MPTokenAuthorize requer MPTokenIssuanceID OU (Currency + Issuer)');
  }

  // Flags: se authorize = false, usa flag tfMPTUnauthorize
  if (!authorize) {
    transaction.Flags = 0x00000001; // tfMPTUnauthorize
  }

  return transaction;
}

export function buildMPTokenFreezeTransaction({
  issuer,
  currency,
  holder,
  freeze,
}: MPTokenFreezeParams) {
  return {
    TransactionType: 'MPTokenFreeze',
    Account: issuer,
    Currency: currency.toUpperCase(),
    Holder: holder,
    Freeze: freeze,
  };
}

export function buildMPTokenClawbackTransaction({
  issuer,
  currency,
  holder,
  amount,
}: MPTokenClawbackParams) {
  return {
    TransactionType: 'MPTokenClawback',
    Account: issuer,
    Currency: currency.toUpperCase(),
    Holder: holder,
    Amount: amount,
  };
}

export function buildPaymentTransaction({
  sender,
  destination,
  amount,
  currency,
  issuer,
  memo,
}: MPTPaymentParams) {
  const transaction: Record<string, unknown> = {
    TransactionType: 'Payment',
    Account: sender,
    Destination: destination,
    Amount: {
      currency: currency.toUpperCase(),
      issuer,
      value: amount,
    },
  };

  if (memo) {
    transaction.Memos = [
      {
        Memo: {
          MemoType: stringToHex('NOTE'),
          MemoData: stringToHex(memo),
        },
      },
    ];
  }

  return transaction;
}

// Interface para pagamento em XRP nativo
export interface XRPPaymentParams {
  sender: string;
  destination: string;
  amount: string; // Em XRP como string (será convertido para drops)
  memo?: string;
}

// Função para construir transação de pagamento em XRP nativo
export function buildXRPPaymentTransaction({
  sender,
  destination,
  amount,
  memo,
}: XRPPaymentParams) {
  // Validar valor
  if (!isValidXRPAmount(amount)) {
    throw new Error('Valor XRP inválido');
  }

  // Converter com precisão
  const amountInDrops = xrpToDrops(amount);

  // Construir transação no formato correto para XRPL
  const transaction: Record<string, unknown> = {
    TransactionType: 'Payment',
    Account: sender,
    Destination: destination,
    Amount: amountInDrops, // XRP nativo é enviado como string de drops
  };

  // Adicionar memo se fornecido
  if (memo) {
    transaction.Memos = [
      {
        Memo: {
          MemoType: stringToHex('NOTE'),
          MemoData: stringToHex(memo),
        },
      },
    ];
  }

  // Garantir que TransactionType está presente
  if (!transaction.TransactionType) {
    throw new Error('Erro ao construir transação: TransactionType não definido');
  }

  return transaction;
}

// Função para enviar pagamento em XRP nativo
export function sendXRPPayment(params: XRPPaymentParams) {
  const transaction = buildXRPPaymentTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function buildTrustSetTransaction({
  account,
  currency,
  issuer,
  limit = '1000000000',
  flags,
}: TrustSetParams) {
  // Validações básicas
  if (!account || typeof account !== 'string') {
    throw new Error('Account é obrigatório e deve ser uma string');
  }
  
  if (!currency || typeof currency !== 'string') {
    throw new Error('Currency é obrigatório e deve ser uma string');
  }
  
  if (!issuer || typeof issuer !== 'string') {
    throw new Error('Issuer é obrigatório e deve ser uma string');
  }
  
  // Validar formato do endereço
  if (!account.startsWith('r') || account.length < 25) {
    throw new Error('Account deve ser um endereço XRPL válido (começa com "r")');
  }
  
  if (!issuer.startsWith('r') || issuer.length < 25) {
    throw new Error('Issuer deve ser um endereço XRPL válido (começa com "r")');
  }
  
  // Validar limit
  if (!limit || typeof limit !== 'string') {
    throw new Error('Limit deve ser uma string');
  }
  
  // Validar que limit é um número válido
  const limitNum = parseFloat(limit);
  if (isNaN(limitNum) || limitNum < 0) {
    throw new Error('Limit deve ser um número positivo');
  }

  const transaction: Record<string, unknown> = {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: {
      currency: currency.toUpperCase(),
      issuer,
      value: limit,
    },
  };

  if (typeof flags === 'number') {
    transaction.Flags = flags;
  }

  return transaction;
}

export async function signAndSubmitTransaction(
  transaction: Record<string, unknown>,
  options?: {
    network?: string;
    validate?: boolean;
    timeout?: number;
  }
) {
  const sdk = getCrossmarkSDK();
  if (!sdk) {
    throw new Error('Crossmark SDK indisponível. Certifique-se de que a extensão está carregada.');
  }

  // Garantir que a transação tem TransactionType
  if (!transaction.TransactionType) {
    throw new Error('Transação deve ter TransactionType definido');
  }

  // Validar transação se solicitado (padrão: false para evitar problemas)
  if (options?.validate === true) {
    const { validateTransaction } = await import('./validation');
    const validation = await validateTransaction(
      transaction,
      (options?.network as any) ?? 'testnet'
    );

    if (!validation.valid) {
      throw new Error(
        `Transação inválida: ${validation.errors.join(', ')}`
      );
    }

    if (validation.warnings.length > 0) {
      console.warn('[Crossmark] Avisos de validação:', validation.warnings);
    }
  }

  if (!sdk.async.signAndSubmitAndWait) {
    throw new Error('A versão atual da Crossmark não suporta signAndSubmitAndWait.');
  }

  // Garantir que estamos passando a transação corretamente
  // Crossmark espera tx_json com a transação completa
  // Criar uma cópia limpa da transação para evitar problemas de referência
  const txJson: Record<string, unknown> = {};
  
  // Copiar todos os campos da transação
  for (const key in transaction) {
    if (transaction.hasOwnProperty(key)) {
      txJson[key] = transaction[key];
    }
  }

  // Garantir que TransactionType está presente e é uma string
  if (!txJson.TransactionType || typeof txJson.TransactionType !== 'string') {
    console.error('[Crossmark] Transação inválida:', transaction);
    throw new Error(`TransactionType deve ser uma string. Recebido: ${typeof txJson.TransactionType}`);
  }

  // Log da transação antes de enviar (apenas em dev)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Crossmark] Enviando transação:', {
      TransactionType: txJson.TransactionType,
      Account: txJson.Account,
      keys: Object.keys(txJson),
      txJson: JSON.stringify(txJson, null, 2),
    });
  }

  try {
    const response = await sdk.async.signAndSubmitAndWait({
      tx_json: txJson,
      autofill: true,
      failHard: true,
      timeout: options?.timeout ?? 60000,
    });

    if (!response) {
      throw new Error('Não foi possível obter a resposta da Crossmark.');
    }

    // Log da resposta completa para debug
    if (process.env.NODE_ENV === 'development') {
      console.log('[Crossmark] Resposta completa:', JSON.stringify(response, null, 2));
    }

    const responseObj = response as any;
    
    // PRIMEIRO: Verificar se há erro na resposta (antes de verificar status)
    // O Crossmark pode retornar erro em response.data.errorMessage ou response.response.data.errorMessage
    const errorMessage = 
      responseObj?.response?.data?.errorMessage ??
      responseObj?.data?.errorMessage ??
      responseObj?.errorMessage;
    
    // Verificar meta para erros
    const meta = 
      responseObj?.response?.data?.meta ??
      responseObj?.data?.meta;
    
    // Se há erro ou meta indica erro, lançar exceção IMEDIATAMENTE
    if (errorMessage || meta?.isError || meta?.isRejected) {
      const finalErrorMessage = errorMessage || 'Transação rejeitada ou falhou';
      
      console.error('[Crossmark] Transação rejeitada ou com erro:', {
        errorMessage: finalErrorMessage,
        meta,
        transactionType: txJson.TransactionType,
        account: txJson.Account,
      });
      
      // Se o erro menciona TransactionType, pode ser que o tipo não seja suportado
      if (finalErrorMessage.includes('TransactionType')) {
        throw new Error(
          `Tipo de transação não suportado ou inválido: ${txJson.TransactionType}. ` +
          `O Crossmark pode não suportar este tipo de transação ainda. ` +
          `Erro: ${finalErrorMessage}`
        );
      }
      
      throw new Error(finalErrorMessage);
    }

    // Verificar status da transação - múltiplos caminhos possíveis
    const status = 
      responseObj?.data?.result?.engine_result ??
      responseObj?.data?.engine_result ??
      responseObj?.result?.engine_result ??
      responseObj?.engine_result ??
      responseObj?.response?.data?.result?.engine_result ??
      responseObj?.response?.data?.engine_result ??
      responseObj?.response?.result?.engine_result;

    // Verificar se a transação falhou
    if (status && typeof status === 'string' && !status.startsWith('tes')) {
      // Extrair mensagem de erro mais detalhada
      const statusErrorMessage = 
        responseObj?.data?.result?.engine_result_message ?? 
        responseObj?.data?.result?.message ??
        responseObj?.data?.message ?? 
        responseObj?.message ??
        responseObj?.response?.data?.result?.engine_result_message ??
        responseObj?.response?.data?.message ??
        responseObj?.response?.message ??
        `Transação falhou: ${status}`;
      
      // Log detalhado do erro
      console.error('[Crossmark] Transação falhou:', {
        status,
        errorMessage: statusErrorMessage,
        transactionType: txJson.TransactionType,
        account: txJson.Account,
      });
      
      throw new Error(statusErrorMessage || `Transação falhou com código: ${status}`);
    }

    // Verifica se tem hash na resposta (apenas log, não falha)
    // Só tenta extrair hash se não houver erro
    const hash = extractTransactionHash(response);
    if (!hash) {
      // Se não tem hash mas também não tem erro, pode ser que a transação ainda esteja pendente
      // ou que o formato da resposta seja diferente
      const hasError = 
        responseObj?.response?.data?.errorMessage ||
        responseObj?.data?.errorMessage ||
        responseObj?.errorMessage;
      
      if (!hasError) {
        // Log detalhado para debug apenas se não houver erro
        console.warn('[Crossmark] Resposta não contém hash detectável. Estrutura:', {
          keys: Object.keys(responseObj),
          hasData: !!responseObj?.data,
          hasResponse: !!responseObj?.response,
          hasResult: !!responseObj?.result,
          responseType: typeof responseObj?.response,
          responseKeys: responseObj?.response ? Object.keys(responseObj.response) : null,
        });
        
        // Tenta extrair hash de outras formas
        if (responseObj?.response) {
          console.log('[Crossmark] Explorando response:', responseObj.response);
        }
      }
    } else {
      console.log('[Crossmark] Hash extraído com sucesso:', hash);
    }

    return response;
  } catch (error: any) {
    // Se o erro é de rejeição do usuário, lança erro mais claro
    if (
      error?.message?.toLowerCase().includes('rejected') || 
      error?.message?.toLowerCase().includes('canceled') || 
      error?.message?.toLowerCase().includes('cancelled') ||
      error?.code === 'USER_REJECTED' ||
      error?.code === 'USER_CANCELED'
    ) {
      throw new Error('Transação cancelada pelo usuário');
    }
    
    // Se o erro já tem uma mensagem clara, apenas relança
    if (error instanceof Error && error.message) {
      console.error('[Crossmark] Erro ao enviar transação:', {
        message: error.message,
        transactionType: txJson.TransactionType,
        account: txJson.Account,
        error: error,
      });
      throw error;
    }
    
    // Log do erro completo e cria um novo erro com mensagem clara
    console.error('[Crossmark] Erro ao enviar transação:', error);
    
    // Tenta extrair mensagem do erro de múltiplos caminhos possíveis
    const errorMessage = 
      error?.message ??
      error?.response?.data?.errorMessage ??
      error?.data?.errorMessage ??
      error?.data?.result?.engine_result_message ??
      error?.data?.message ??
      error?.response?.data?.result?.engine_result_message ??
      error?.response?.data?.message ??
      error?.errorMessage ??
      'Erro desconhecido ao enviar transação';
    
    throw new Error(errorMessage);
  }
}

export function authorizeMPToken(params: MPTokenAuthorizeParams) {
  const transaction = buildMPTokenAuthorizeTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function freezeMPToken(params: MPTokenFreezeParams) {
  const transaction = buildMPTokenFreezeTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function clawbackMPToken(params: MPTokenClawbackParams) {
  const transaction = buildMPTokenClawbackTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function sendMPToken(params: MPTPaymentParams) {
  const transaction = buildPaymentTransaction(params);
  return signAndSubmitTransaction(transaction);
}

export function trustSetToken(params: TrustSetParams) {
  const transaction = buildTrustSetTransaction(params);
  return signAndSubmitTransaction(transaction);
}

