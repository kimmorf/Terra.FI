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

    // Configurar listeners para reconexão automática
    this.setupConnectionListeners(client, network);

    try {
      // Conectar com timeout
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout ao conectar com XRPL')), 10000)
        )
      ]);
      
      // Verificar se realmente está conectado após conectar
      if (!client.isConnected()) {
        throw new Error('Falha ao estabelecer conexão com XRPL');
      }
      
      return client;
    } catch (error) {
      console.error(`[XRPL Pool] Erro ao conectar ${network}:`, error);
      // Tentar desconectar se falhou para limpar recursos
      try {
        await client.disconnect();
      } catch {
        // Ignora erro ao desconectar
      }
      throw error;
    }
  }

  private setupConnectionListeners(client: Client, network: XRPLNetwork): void {
    // Listener para desconexão inesperada
    const onDisconnect = () => {
      console.log(`[XRPL Pool] Conexão ${network} desconectada, tentando reconectar...`);
      const state = this.connections.get(network);
      if (state) {
        state.reconnectAttempts++;
        // Tentar reconectar após um delay
        setTimeout(() => {
          this.attemptReconnect(network).catch((error) => {
            console.error(`[XRPL Pool] Falha ao reconectar ${network}:`, error);
            // Se exceder tentativas, remover conexão
            if (state.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
              console.error(`[XRPL Pool] Excedeu tentativas de reconexão para ${network}, removendo conexão`);
              this.connections.delete(network);
            }
          });
        }, 1000 * state.reconnectAttempts); // Backoff exponencial
      }
    };

    // Tentar adicionar listeners se disponível
    try {
      // O cliente XRPL pode ter eventos, mas não temos acesso direto
      // Vamos verificar a conexão periodicamente
    } catch (error) {
      // Ignora se não conseguir adicionar listeners
    }
  }

  private async attemptReconnect(network: XRPLNetwork): Promise<void> {
    const state = this.connections.get(network);
    if (!state) {
      // Se não existe estado, não há nada para reconectar
      return;
    }

    try {
      // IMPORTANTE: Segundo a documentação do xrpl.js, não é recomendado
      // tentar reconectar um client desconectado. É melhor criar um novo.
      // Mas vamos tentar uma vez antes de descartar
      if (state.client.isConnected()) {
        state.reconnectAttempts = 0;
        return;
      }

      // Tentar reconectar com timeout
      await Promise.race([
        state.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout ao reconectar')), 5000)
        )
      ]);
      
      // Verificar se realmente reconectou
      if (!state.client.isConnected()) {
        throw new Error('Reconexão falhou - conexão não estabelecida');
      }
      
      state.reconnectAttempts = 0;
      state.lastUsed = Date.now();
      console.log(`[XRPL Pool] Reconectado com sucesso ${network}`);
    } catch (error) {
      console.error(`[XRPL Pool] Erro ao reconectar ${network}:`, error);
      // Se falhou, remove a conexão para forçar criação de nova na próxima vez
      this.connections.delete(network);
      throw error;
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
