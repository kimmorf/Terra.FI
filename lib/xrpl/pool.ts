/**
 * Pool de conexões XRPL para melhorar performance
 */

import { Client } from 'xrpl';

export type XRPLNetwork = 'testnet' | 'mainnet' | 'devnet';

// Endpoints alternativos para cada rede
const XRPL_ENDPOINTS: Record<XRPLNetwork, string[]> = {
  mainnet: [
    'wss://xrplcluster.com',
    'wss://s1.ripple.com',
    'wss://s2.ripple.com',
  ],
  testnet: [
    'wss://s.altnet.rippletest.net:51233',
    'wss://testnet.xrpl-labs.com',
  ],
  devnet: [
    'wss://s.devnet.rippletest.net:51233',
  ],
};

function getEndpoint(network: XRPLNetwork): string {
  const endpoints = XRPL_ENDPOINTS[network];
  // Usar o primeiro endpoint por padrão
  return endpoints[0];
}

interface ConnectionState {
  client: Client;
  lastUsed: number;
}

export class XRPLConnectionPool {
  private connections: Map<XRPLNetwork, ConnectionState> = new Map();
  private connecting: Map<XRPLNetwork, Promise<Client>> = new Map();
  private readonly MAX_IDLE_TIME = 5 * 60 * 1000; // 5 minutos
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
      // Verificar se está realmente conectado
      // IMPORTANTE: isConnected() pode retornar true mesmo se a conexão foi perdida
      // Vamos fazer uma verificação mais robusta
      try {
        if (existing.client.isConnected()) {
          // Verificar se a conexão não está muito antiga (mais de 5 minutos sem uso)
          const timeSinceLastUse = Date.now() - existing.lastUsed;
          if (timeSinceLastUse > this.MAX_IDLE_TIME) {
            // Conexão muito antiga, criar nova
            console.log(`[XRPL Pool] Conexão ${network} muito antiga (${Math.floor(timeSinceLastUse / 1000)}s), criando nova...`);
            try {
              await existing.client.disconnect();
            } catch {
              // Ignora erro ao desconectar
            }
            this.connections.delete(network);
          } else {
            // Conexão parece válida, usar
            existing.lastUsed = Date.now();
            return existing.client;
          }
        } else {
          // Não está conectado, remover e criar nova
          console.log(`[XRPL Pool] Conexão ${network} não está conectada, removendo...`);
          this.connections.delete(network);
        }
      } catch (error) {
        // Se isConnected() lançar erro, a conexão está morta
        console.log(`[XRPL Pool] Conexão ${network} inválida (erro ao verificar), removendo...`);
        try {
          await existing.client.disconnect();
        } catch {
          // Ignora erro ao desconectar
        }
        this.connections.delete(network);
      }
    }

    // Cria nova conexão (não tenta reconectar - cria nova instância)
    const connectPromise = this.createConnection(network);
    this.connecting.set(network, connectPromise);

    try {
      const client = await connectPromise;
      this.connections.set(network, {
        client,
        lastUsed: Date.now(),
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
    const endpoints = XRPL_ENDPOINTS[network];
    let lastError: Error | null = null;

    // Tentar cada endpoint disponível
    for (const endpoint of endpoints) {
      console.log(`[XRPL Pool] Tentando conectar a ${network} via ${endpoint}...`);
    
    const client = new Client(endpoint);

    try {
      // Conectar
      await client.connect();
        console.log(`[XRPL Pool] connect() OK para ${network} via ${endpoint}`);

        // Aguardar um pouco para a conexão estabilizar
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verificar se está realmente conectado
        let retries = 3;
        while (!client.isConnected() && retries > 0) {
          console.log(`[XRPL Pool] Aguardando conexão estabilizar... (${retries} tentativas restantes)`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          retries--;
        }
        
      if (!client.isConnected()) {
          console.log(`[XRPL Pool] Conexão não estabelecida, tentando próximo endpoint...`);
          try { await client.disconnect(); } catch {}
          continue;
      }

        // Health check simples: server_info (tolerante a falhas)
        try {
          const serverInfo = await client.request({ command: 'server_info' } as any);
          console.log(`[XRPL Pool] Health check OK para ${network} - Ledger: ${serverInfo.result?.info?.validated_ledger?.seq || 'N/A'}`);
        } catch (pingError: any) {
          console.warn(`[XRPL Pool] Health check falhou, mas conexão parece OK:`, pingError.message);
          // Não falhar se conexão parece OK - apenas logar warning
          if (!client.isConnected()) {
            try { await client.disconnect(); } catch {}
            continue;
          }
        }
      
      return client;
      } catch (error: any) {
        console.error(`[XRPL Pool] Erro ao conectar ${network} via ${endpoint}:`, error.message);
        lastError = error;
        try { await client.disconnect(); } catch {}
        // Continua tentando próximo endpoint
      }
    }

    throw lastError || new Error(`Não foi possível conectar a nenhum endpoint para ${network}`);
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
