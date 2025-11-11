/**
 * Serviço para operações MPT (Multi-Purpose Tokens)
 */

import { Client } from 'xrpl';
import * as xrpl from 'xrpl';
import { xrplPool, type XRPLNetwork } from '../xrpl/pool';
import { ReliableSubmission } from '../xrpl/reliable-submission';
import type { IssueMPTDto } from './dto/issue-mpt.dto';
import type { AuthorizeMPTDto } from './dto/authorize-mpt.dto';
import type { SendMPTDto } from './dto/send-mpt.dto';

export class MptService {
  private issuerSeed: string;
  private network: XRPLNetwork;

  constructor(issuerSeed?: string, network: XRPLNetwork = 'testnet') {
    this.issuerSeed = issuerSeed || process.env.XRPL_ISSUER_SECRET || '';
    this.network = network;
  }

  private flagsToInt(f: IssueMPTDto['flags']): number {
    const map: Record<string, number> = {
      canLock: 0x00000002,
      requireAuth: 0x00000004,
      canEscrow: 0x00000008,
      canTrade: 0x00000010,
      canTransfer: 0x00000020,
      canClawback: 0x00000040,
    };

    return Object.entries(f || {}).reduce(
      (acc, [k, v]) => (v ? acc + map[k] : acc),
      0
    );
  }

  async issue(dto: IssueMPTDto) {
    if (!this.issuerSeed) {
      throw new Error('XRPL_ISSUER_SECRET não configurado');
    }

    const issuer = xrpl.Wallet.fromSeed(this.issuerSeed);
    const client = await xrplPool.getClient(this.network);

    try {
      const MPTokenMetadata = dto.metadataJSON
        ? Buffer.from(JSON.stringify(dto.metadataJSON)).toString('hex').toUpperCase()
        : undefined;

      const tx: any = {
        TransactionType: 'MPTokenIssuanceCreate',
        Account: issuer.address,
        AssetScale: dto.assetScale ?? 0,
        MaximumAmount: dto.maximumAmount ?? '0',
        TransferFee: dto.transferFee ?? 0,
      };

      if (MPTokenMetadata) {
        tx.MPTokenMetadata = MPTokenMetadata;
      }

      const flags = this.flagsToInt(dto.flags);
      if (flags > 0) {
        tx.Flags = flags;
      }

      // Autofill
      const prepared = await client.autofill(tx);

      // Assinar
      const signed = issuer.sign(prepared);

      // Submeter e aguardar validação
      const rs = new ReliableSubmission(this.network);
      const out = await rs.submitAndWait(signed.tx_blob);

      // Extrai MPTokenIssuanceID do meta da transação
      const issuanceIdHex = (out.result.meta as any)?.MPTokenIssuanceID || 
                            (out.result.meta as any)?.AffectedNodes?.[0]?.CreatedNode?.NewFields?.MPTokenIssuanceID;

      return {
        txHash: out.result.tx_json?.hash || undefined,
        meta: out.result.meta,
        issuanceIdHex: issuanceIdHex ? String(issuanceIdHex) : undefined,
      };
    } finally {
      // Não desconecta o client do pool
    }
  }

  async authorize(dto: AuthorizeMPTDto, holderSeed?: string) {
    const client = await xrplPool.getClient(this.network);

    try {
      const tx: any = {
        TransactionType: 'MPTokenAuthorize',
        Account: dto.holderAddress,
        MPTokenIssuanceID: dto.issuanceIdHex,
      };

      if (dto.unauthorize) {
        tx.Flags = 0x00000001; // tfMPTUnauthorize
      }

      // Autofill
      const prepared = await client.autofill(tx);

      // Se tiver seed, assina no backend
      if (holderSeed) {
        const holder = xrpl.Wallet.fromSeed(holderSeed);
        const signed = holder.sign(prepared);
        const rs = new ReliableSubmission(this.network);
        const out = await rs.submitAndWait(signed.tx_blob);

        return {
          txHash: out.result.tx_json?.hash,
          meta: out.result.meta,
        };
      }

      // Caso contrário, retorna preparado para assinatura no frontend
      return {
        prepared: prepared,
        txBlob: null,
        needsSigning: true,
      };
    } finally {
      // Não desconecta o client do pool
    }
  }

  async send(dto: SendMPTDto, senderSeed?: string) {
    const client = await xrplPool.getClient(this.network);

    try {
      // Se txBlob já veio assinado do frontend, só submete
      if (dto.txBlob) {
        const rs = new ReliableSubmission(this.network);
        const out = await rs.submitAndWait(dto.txBlob);

        return {
          txHash: out.result.tx_json?.hash,
          meta: out.result.meta,
        };
      }

      // Se não tem txBlob, precisa de seed para assinar no backend
      if (!senderSeed) {
        throw new Error('Missing txBlob or sender seed');
      }

      const sender = xrpl.Wallet.fromSeed(senderSeed);
      const tx: any = {
        TransactionType: 'Payment',
        Account: sender.address,
        Destination: dto.destination,
        Amount: {
          mpt_issuance_id: dto.mptIssuanceIdHex,
          value: dto.amount,
        },
      };

      // Autofill
      const prepared = await client.autofill(tx);

      // Assinar
      const signed = sender.sign(prepared);

      // Submeter
      const rs = new ReliableSubmission(this.network);
      const out = await rs.submitAndWait(signed.tx_blob);

      return {
        txHash: out.result.tx_json?.hash,
        meta: out.result.meta,
      };
    } finally {
      // Não desconecta o client do pool
    }
  }
}
