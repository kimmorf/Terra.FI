/**
 * Pool de conexões XRPL para melhorar performance
 */

import { Client } from 'xrpl';

export type XRPLNetwork = 'testnet' | 'mainnet' | 'devnet';

const XRPL_ENDPOINTS: Record<XRPLNetwork, string> = {
  mainnet: 'wss://xrplcluster.com',
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
};

interface ConnectionState {
  client: Client;
  lastUsed: number;
  reconnectAttempts: number;
}

export class XRPLConnectionPool {
  private connections: Map<XRPLNetwork, ConnectionState> = new Map();
  private connecting: Map<XRPLNetwork, Promise<Client>> = new Map();
  private readonly MAX_IDLE_TIME = 5 * 60 * 1000; // 5 minutos
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Limpar conexões idle periodicamente
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        this.cleanupIdleConnections();
      }, 60000); // A cada minuto
    }
  }

  async getClient(network: XRPLNetwork = 'testnet'): Promise<Client> {
    // Se já está conectando, aguarda
    if (this.connecting.has(network)) {
      return this.connecting.get(network)!;
    }

    // Verifica se já existe conexão válida
    const existing = this.connections.get(network);
    if (existing) {
      if (existing.client.isConnected()) {
        existing.lastUsed = Date.now();
        return existing.client;
      } else {
        // Remove conexão desconectada
        this.connections.delete(network);
      }
    }

    // Cria nova conexão
    const connectPromise = this.createConnection(network);
    this.connecting.set(network, connectPromise);

    try {
      const client = await connectPromise;
      this.connections.set(network, {
        client,
        lastUsed: Date.now(),
        reconnectAttempts: 0,
      });
      return client;
    } catch (error) {
      this.connecting.delete(network);
      throw error;
    } finally {
      this.connecting.delete(network);
    }
  }

  private async createConnection(network: XRPLNetwork): Promise<Client> {
    const endpoint = XRPL_ENDPOINTS[network];
    const client = new Client(endpoint);

    await client.connect();
    return client;
  }

  private async reconnect(network: XRPLNetwork): Promise<void> {
    try {
      const state = this.connections.get(network);
      if (!state) return;

      if (!state.client.isConnected()) {
        await state.client.connect();
        state.reconnectAttempts = 0;
        state.lastUsed = Date.now();
      }
    } catch (error) {
      console.error(`[XRPL Pool] Falha ao reconectar ${network}:`, error);
    }
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    const entries = Array.from(this.connections.entries());
    for (const [network, state] of entries) {
      if (now - state.lastUsed > this.MAX_IDLE_TIME) {
        if (state.client.isConnected()) {
          state.client.disconnect().catch(() => {
            // Ignora erros ao desconectar
          });
        }
        this.connections.delete(network);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    const entries = Array.from(this.connections.entries());
    for (const [network, state] of entries) {
      if (state.client.isConnected()) {
        await state.client.disconnect().catch(() => {
          // Ignora erros
        });
      }
    }
    this.connections.clear();
    this.connecting.clear();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton
export const xrplPool = new XRPLConnectionPool();
