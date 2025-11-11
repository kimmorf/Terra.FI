/**
 * Serviço de compra primária de MPT
 * Orquestra duas pernas: pagamento → envio MPT
 */

import { prisma } from '@/lib/prisma';
import { xrplPool, type XRPLNetwork } from '@/lib/xrpl/pool';
import { MptService } from '@/lib/mpt/mpt.service';
import { ReliableSubmission } from '@/lib/xrpl/reliable-submission';
import { Wallet, Client } from 'xrpl';
import type { QuotePurchaseDto, CommitPurchaseDto, ConfirmPurchaseDto } from './dto/purchase.dto';

export type PurchaseStatus =
  | 'PENDING_PAYMENT'
  | 'FUNDS_CONFIRMED'
  | 'MPT_SENT'
  | 'COMPLETED'
  | 'COMPENSATION_REQUIRED'
  | 'REFUNDED';

export class PurchaseService {
  private issuerSeed: string;
  private treasuryAddress: string;
  private network: XRPLNetwork;

  constructor(
    issuerSeed?: string,
    treasuryAddress?: string,
    network: XRPLNetwork = 'testnet'
  ) {
    this.issuerSeed = issuerSeed || process.env.XRPL_ISSUER_SECRET || '';
    this.treasuryAddress =
      treasuryAddress || process.env.XRPL_TREASURY_ADDRESS || '';
    this.network = network;
  }

  /**
   * Verifica se holder está autorizado para o MPT
   */
  async checkAuthorization(
    holderAddress: string,
    issuanceIdHex: string
  ): Promise<boolean> {
    const client = await xrplPool.getClient(this.network);

    try {
      // Busca account_lines do holder
      const response = await client.request({
        command: 'account_lines',
        account: holderAddress,
        ledger_index: 'validated',
      });

      // Verifica se há linha autorizada para este issuance
      const lines = response.result.lines || [];
      return lines.some(
        (line: any) =>
          line.mpt_issuance_id?.toUpperCase() === issuanceIdHex.toUpperCase() &&
          line.authorized === true
      );
    } catch (error) {
      console.error('[Purchase] Erro ao verificar autorização:', error);
      return false;
    }
  }

  /**
   * Verifica disponibilidade do token
   */
  async checkAvailability(
    issuanceIdHex: string,
    requestedQuantity: string
  ): Promise<{ available: boolean; reason?: string }> {
    const client = await xrplPool.getClient(this.network);

    try {
      // Busca informações do issuance
      const response = await client.request({
        command: 'account_lines',
        account: this.treasuryAddress,
        ledger_index: 'validated',
      });

      const lines = response.result.lines || [];
      const issuanceLine = lines.find(
        (line: any) =>
          line.mpt_issuance_id?.toUpperCase() === issuanceIdHex.toUpperCase()
      );

      if (!issuanceLine) {
        return { available: false, reason: 'Issuance não encontrado' };
      }

      // Verifica MaximumAmount se configurado
      // Por enquanto, assumimos que está disponível se a linha existe
      // TODO: Implementar verificação de estoque alocado vs vendido

      return { available: true };
    } catch (error) {
      console.error('[Purchase] Erro ao verificar disponibilidade:', error);
      return { available: false, reason: 'Erro ao verificar disponibilidade' };
    }
  }

  /**
   * Gera cotação de preço
   */
  async quote(dto: QuotePurchaseDto): Promise<{
    quoteId: string;
    price: string;
    currency: string;
    expiresAt: Date;
    treasuryAddress: string;
  }> {
    // TODO: Integrar com oráculo de preço (RLUSD/XRP)
    // Por enquanto, preço fixo para demonstração
    const price = dto.currency === 'XRP' ? '1.0' : '1.0'; // 1:1 simplificado

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + 60); // 60s de validade

    // Persiste cotação (temporariamente sem persistência até modelo ser criado)
    // TODO: Adicionar modelo PricingQuote ao schema
    const quoteId = `quote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return {
      quoteId,
      price,
      currency: dto.currency,
      expiresAt,
      treasuryAddress: this.treasuryAddress,
    };
  }

  /**
   * Registra intenção de compra
   */
  async commit(dto: CommitPurchaseDto): Promise<{
    purchaseId: string;
    paymentInstructions: {
      destination: string;
      amount: string;
      currency: string;
      memo: string;
    };
  }> {
    // Gera purchaseId único
    const purchaseId = dto.purchaseId || `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Verifica autorização
    const isAuthorized = await this.checkAuthorization(
      dto.buyerAddress,
      dto.issuanceIdHex
    );

    if (!isAuthorized) {
      throw new Error(
        'Comprador não autorizado. É necessário autorizar o holder antes da compra.'
      );
    }

    // Verifica disponibilidade
    const availability = await this.checkAvailability(
      dto.issuanceIdHex,
      dto.quantity
    );

    if (!availability.available) {
      throw new Error(availability.reason || 'Token não disponível');
    }

    // Cria memo da operação
    const memo = `Purchase:${purchaseId}:${dto.issuanceIdHex.slice(0, 16)}`;

    // Calcula valor do pagamento
    const paymentAmount = (
      parseFloat(dto.quotedPrice) * parseFloat(dto.quantity)
    ).toFixed(6);

    // Cria registro de compra
    const purchase = await prisma.purchase.create({
      data: {
        purchaseId,
        userId: dto.buyerAddress, // Usa buyerAddress como userId temporariamente
        amount: parseFloat(paymentAmount),
        currency: dto.currency,
        mptCurrency: dto.issuanceIdHex, // Temporário - usar campo correto depois
        mptAmount: dto.quantity,
        mptIssuer: this.treasuryAddress, // Temporário
        status: 'PENDING',
        metadata: {
          issuanceIdHex: dto.issuanceIdHex,
          buyerAddress: dto.buyerAddress,
          quantity: dto.quantity,
          quotedPrice: dto.quotedPrice,
          treasuryAddress: this.treasuryAddress,
          memo,
          network: dto.network || 'testnet',
        },
      },
    });

    // Registra evento
    await prisma.purchaseEvent.create({
      data: {
        purchaseId: purchase.id,
        eventType: 'purchase_committed',
        fromState: null,
        toState: 'PENDING_PAYMENT',
        triggeredBy: 'system',
      },
    });

    return {
      purchaseId,
      paymentInstructions: {
        destination: this.treasuryAddress,
        amount: paymentAmount,
        currency: dto.currency,
        memo,
      },
    };
  }

  /**
   * Confirma pagamento e dispara envio de MPT
   */
  async confirm(dto: ConfirmPurchaseDto): Promise<{
    purchaseId: string;
    status: PurchaseStatus;
    paymentTxHash?: string;
    mptTxHash?: string;
  }> {
    // Busca compra
    const purchase = await prisma.purchase.findUnique({
      where: { purchaseId: dto.purchaseId },
      include: { ledgerTxs: true, events: true },
    });

    if (!purchase) {
      throw new Error('Compra não encontrada');
    }

    // Se já tem paymentTxHash, verifica se é o mesmo
    if (dto.paymentTxHash && purchase.paymentTxHash) {
      if (purchase.paymentTxHash !== dto.paymentTxHash) {
        throw new Error('Hash de pagamento não confere');
      }
    }

    // Se não tem paymentTxHash ainda, tenta detectar on-ledger ou usa o fornecido
    let paymentTxHash = purchase.paymentTxHash || dto.paymentTxHash;

    if (!paymentTxHash) {
      // Tenta detectar pagamento on-ledger verificando transações recentes
      paymentTxHash = await this.detectPaymentOnLedger(
        purchase.buyerAddress,
        purchase.treasuryAddress,
        purchase.memo || ''
      );
    }

    if (!paymentTxHash) {
      throw new Error(
        'Pagamento não detectado. Aguarde confirmação ou forneça paymentTxHash.'
      );
    }

    // Verifica se pagamento foi validado
    const paymentValidated = await this.verifyPayment(paymentTxHash);

    if (!paymentValidated) {
      throw new Error('Pagamento não foi validado no ledger');
    }

    // Atualiza compra com hash do pagamento
    if (!purchase.paymentTxHash) {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          paymentTxHash: paymentTxHash,
          status: 'FUNDS_CONFIRMED',
        },
      });

      // Registra transação do ledger
      await prisma.ledgerTx.create({
        data: {
          purchaseId: purchase.id,
          leg: 1,
          txHash: paymentTxHash,
          status: 'validated',
        },
      });

      // Registra evento
      await prisma.purchaseEvent.create({
        data: {
          purchaseId: purchase.id,
          eventType: 'payment_confirmed',
          fromState: 'PENDING_PAYMENT',
          toState: 'FUNDS_CONFIRMED',
          triggeredBy: 'system',
        },
      });
    }

    // Se já enviou MPT, retorna
    if (purchase.status === 'MPT_SENT' || purchase.status === 'COMPLETED') {
      return {
        purchaseId: purchase.purchaseId,
        status: purchase.status as PurchaseStatus,
        paymentTxHash: purchase.paymentTxHash || undefined,
        mptTxHash: purchase.mptTxHash || undefined,
      };
    }

    // Dispara envio de MPT (perna 2)
    try {
      const mptTxHash = await this.sendMPTToBuyer(
        purchase.issuanceIdHex,
        purchase.buyerAddress,
        purchase.quantity,
        purchase.id
      );

      // Atualiza compra
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          mptTxHash,
          status: 'COMPLETED',
        },
      });

      // Registra transação do ledger
      await prisma.ledgerTx.create({
        data: {
          purchaseId: purchase.id,
          leg: 2,
          txHash: mptTxHash,
          status: 'validated',
        },
      });

      // Registra evento
      await prisma.purchaseEvent.create({
        data: {
          purchaseId: purchase.id,
          eventType: 'mpt_sent',
          fromState: 'FUNDS_CONFIRMED',
          toState: 'COMPLETED',
          triggeredBy: 'system',
        },
      });

      return {
        purchaseId: purchase.purchaseId,
        status: 'COMPLETED',
        paymentTxHash: paymentTxHash,
        mptTxHash,
      };
    } catch (error: any) {
      // Falha no envio de MPT → marca compensação
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          status: 'COMPENSATION_REQUIRED',
          compensationReason: error.message || 'Falha ao enviar MPT',
        },
      });

      await prisma.purchaseEvent.create({
        data: {
          purchaseId: purchase.id,
          eventType: 'compensation_required',
          fromState: 'FUNDS_CONFIRMED',
          toState: 'COMPENSATION_REQUIRED',
          triggeredBy: 'system',
          metadata: { error: error.message },
        },
      });

      throw new Error(
        `Pagamento confirmado mas falha ao enviar MPT: ${error.message}. Compensação necessária.`
      );
    }
  }

  /**
   * Busca estado atual da compra
   */
  async getPurchase(purchaseId: string): Promise<{
    purchase: any;
  }> {
    const purchase = await prisma.purchase.findUnique({
      where: { purchaseId },
    });

    if (!purchase) {
      throw new Error('Compra não encontrada');
    }

    return {
      purchase: {
        ...purchase,
        buyerAddress: purchase.userId, // Usa userId como buyerAddress temporariamente
      },
    };
  }

  /**
   * Detecta pagamento on-ledger
   */
  private async detectPaymentOnLedger(
    buyerAddress: string,
    treasuryAddress: string,
    memo: string
  ): Promise<string | undefined> {
    const client = await xrplPool.getClient(this.network);

    try {
      // Busca transações recentes do buyer
      const response = await client.request({
        command: 'account_tx',
        account: buyerAddress,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit: 20,
        binary: false,
      });

      const transactions = response.result.transactions || [];

      // Procura pagamento para treasury com memo correspondente
      for (const tx of transactions) {
        const txData = tx.tx || tx;
        if (
          txData.TransactionType === 'Payment' &&
          txData.Destination === treasuryAddress &&
          txData.Memos?.some((m: any) =>
            Buffer.from(m.Memo.MemoData, 'hex')
              .toString('utf-8')
              .includes(memo)
          )
        ) {
          return txData.hash;
        }
      }

      return undefined;
    } catch (error) {
      console.error('[Purchase] Erro ao detectar pagamento:', error);
      return undefined;
    }
  }

  /**
   * Verifica se pagamento foi validado
   */
  private async verifyPayment(txHash: string): Promise<boolean> {
    const client = await xrplPool.getClient(this.network);

    try {
      const response = await client.request({
        command: 'tx',
        transaction: txHash,
      });

      return (
        response.result.validated &&
        response.result.meta?.TransactionResult === 'tesSUCCESS'
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Envia MPT para o comprador
   */
  private async sendMPTToBuyer(
    issuanceIdHex: string,
    buyerAddress: string,
    quantity: string,
    purchaseDbId: string
  ): Promise<string> {
    if (!this.issuerSeed) {
      throw new Error('XRPL_ISSUER_SECRET não configurado');
    }

    const issuer = Wallet.fromSeed(this.issuerSeed);
    const client = await xrplPool.getClient(this.network);

    try {
      const tx: any = {
        TransactionType: 'Payment',
        Account: issuer.address,
        Destination: buyerAddress,
        Amount: {
          mpt_issuance_id: issuanceIdHex,
          value: quantity,
        },
      };

      const prepared = await client.autofill(tx);
      const signed = issuer.sign(prepared);

      const rs = new ReliableSubmission(this.network);
      const result = await rs.submitAndWait(signed.tx_blob);

      const txHash = result.result.tx_json?.hash;
      if (!txHash) {
        throw new Error('Não foi possível obter hash da transação MPT');
      }

      return txHash;
    } catch (error: any) {
      // Registra erro
      await prisma.ledgerTx.create({
        data: {
          purchaseId: purchaseDbId,
          leg: 2,
          txHash: 'FAILED',
          status: 'failed',
          error: error.message,
        },
      });

      throw error;
    }
  }
}
