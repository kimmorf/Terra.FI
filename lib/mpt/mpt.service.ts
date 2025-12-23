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
import { resolveMPTID, authorizeMPTHolder, sendMPT, createMPT } from '../xrpl/mpt-helpers';

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
    const result = await createMPT({
      issuerAddress: xrpl.Wallet.fromSeed(this.issuerSeed).address,
      issuerSeed: this.issuerSeed,
      assetScale: dto.assetScale,
      maximumAmount: dto.maximumAmount,
      transferFee: dto.transferFee,
      metadataOverrides: dto.metadataJSON,
      flags: dto.flags,
      network: this.network
    });

    return {
      txHash: result.txHash,
      meta: result.result.meta,
      issuanceIdHex: result.mptokenIssuanceID,
    };
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
        const txHash = await authorizeMPTHolder({
          holderAddress: dto.holderAddress,
          holderSeed: holderSeed,
          mptokenIssuanceID: dto.issuanceIdHex,
          authorize: !dto.unauthorize,
          network: this.network
        });

        return { txHash };
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

      const txHash = await sendMPT({
        fromAddress: xrpl.Wallet.fromSeed(senderSeed).address,
        fromSeed: senderSeed,
        toAddress: dto.destination,
        mptokenIssuanceID: dto.mptIssuanceIdHex,
        amount: dto.amount,
        network: this.network
      });

      return { txHash };
    } finally {
      // Não desconecta o client do pool
    }
  }
}
