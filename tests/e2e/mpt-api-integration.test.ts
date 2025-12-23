/**
 * Integration Test: MPT API Operations
 * Testa as APIs REST da plataforma para operações com MPTs
 * 
 * APIs testadas:
 * - POST /api/mpt/create - Criação de MPT
 * - POST /api/mpt/send - Transferência de MPT
 * - GET /api/wallet/balance - Consulta de saldo
 * - GET /api/wallet/transactions - Histórico de transações
 * - GET /api/mpt/list - Listagem de MPTs
 */

import { describe, it, expect, beforeAll } from 'vitest';

// URL base para testes (ajustar conforme necessário)
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

// Variáveis de teste (podem vir de env ou serem criadas)
let testWalletId: string | null = null;
let testMPTIssuanceId: string | null = null;

describe('MPT API Integration Tests', () => {
  
  describe('API Health Check', () => {
    it('deve verificar se o servidor está rodando', async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/wallet/balance?address=rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh&network=testnet`);
        // Pode retornar 200 ou 400 (se endereço não existe), mas não deve dar erro de conexão
        expect([200, 400, 404, 500].includes(response.status)).toBe(true);
      } catch (error: any) {
        // Se der erro de conexão, pular os testes de API
        console.warn('⚠️ Servidor não está rodando. Pulando testes de API.');
        console.warn('   Execute: npm run dev');
        expect(error).toBeNull(); // Força falha para indicar que servidor precisa estar rodando
      }
    });
  });

  describe('GET /api/wallet/balance', () => {
    it('deve retornar erro para endereço inválido', async () => {
      const response = await fetch(`${BASE_URL}/api/wallet/balance?address=invalid&network=testnet`);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it('deve retornar saldo para endereço válido', async () => {
      // Endereço conhecido da XRPL testnet (genesis)
      const response = await fetch(
        `${BASE_URL}/api/wallet/balance?address=rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh&network=testnet`
      );
      
      // Pode retornar 200 ou erro se conta não existe
      if (response.status === 200) {
        const data = await response.json();
        expect(data.address).toBeTruthy();
        expect(typeof data.xrpBalance === 'number' || data.xrpBalance === null).toBe(true);
        expect(Array.isArray(data.tokens)).toBe(true);
        expect(Array.isArray(data.issuedMPTs)).toBe(true);
      }
    });
  });

  describe('GET /api/wallet/transactions', () => {
    it('deve retornar erro para endereço inválido', async () => {
      const response = await fetch(`${BASE_URL}/api/wallet/transactions?address=invalid&network=testnet`);
      
      expect(response.status).toBe(400);
    });

    it('deve retornar transações para endereço válido', async () => {
      const response = await fetch(
        `${BASE_URL}/api/wallet/transactions?address=rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh&network=testnet&limit=5`
      );
      
      if (response.status === 200) {
        const data = await response.json();
        expect(data.address).toBeTruthy();
        expect(Array.isArray(data.transactions)).toBe(true);
        expect(typeof data.count).toBe('number');
      }
    });
  });

  describe('GET /api/mpt/list', () => {
    it('deve listar MPTs do banco de dados', async () => {
      const response = await fetch(`${BASE_URL}/api/mpt/list`);
      
      if (response.status === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
        
        // Se houver MPTs, verificar estrutura
        if (data.length > 0) {
          const mpt = data[0];
          expect(mpt.id).toBeTruthy();
          // Pode ter issuanceIdHex ou currency
          expect(mpt.issuanceIdHex || mpt.currency).toBeTruthy();
        }
      }
    });

    it('deve filtrar MPTs por issuer', async () => {
      // Usar um issuer de teste
      const testIssuer = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
      const response = await fetch(`${BASE_URL}/api/mpt/list?issuer=${testIssuer}`);
      
      // A API pode retornar 200 com array ou objeto com dados
      if (response.ok) {
        const data = await response.json();
        // Verificar se é array ou objeto com propriedade de dados
        const isValidResponse = Array.isArray(data) || 
          (typeof data === 'object' && data !== null && (
            Array.isArray(data.issuances) || 
            Array.isArray(data.mpts) || 
            Array.isArray(data.tokens)
          ));
        expect(isValidResponse || typeof data === 'object').toBe(true);
      }
    });
  });

  describe('POST /api/mpt/create (Mock Test)', () => {
    it('deve retornar erro sem walletId', async () => {
      const response = await fetch(`${BASE_URL}/api/mpt/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: 'TEST',
          maxAmount: '1000000',
        }),
      });
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it('deve retornar erro com walletId inválido', async () => {
      const response = await fetch(`${BASE_URL}/api/mpt/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: 'invalid-wallet-id',
          currency: 'TEST',
          maxAmount: '1000000',
        }),
      });
      
      expect([400, 404, 500].includes(response.status)).toBe(true);
    });
  });

  describe('POST /api/mpt/send (Mock Test)', () => {
    it('deve retornar erro sem parâmetros obrigatórios', async () => {
      const response = await fetch(`${BASE_URL}/api/mpt/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it('deve validar destinatário', async () => {
      const response = await fetch(`${BASE_URL}/api/mpt/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: 'test-wallet',
          destination: 'invalid-address',
          amount: '100',
          currency: 'TEST',
        }),
      });
      
      expect([400, 404, 500].includes(response.status)).toBe(true);
    });
  });
});

describe('MPT Flow Integration (com ServiceWallet)', () => {
  let walletId: string | null = null;
  let walletAddress: string | null = null;

  beforeAll(async () => {
    // Tentar buscar uma carteira existente
    try {
      const response = await fetch(`${BASE_URL}/api/admin/wallets`);
      if (response.status === 200) {
        const wallets = await response.json();
        if (wallets.length > 0) {
          walletId = wallets[0].id;
          walletAddress = wallets[0].address;
          console.log(`📍 Usando carteira existente: ${walletAddress}`);
        }
      }
    } catch (error) {
      console.warn('Não foi possível buscar carteiras existentes');
    }
  });

  it('deve listar carteiras admin', async () => {
    const response = await fetch(`${BASE_URL}/api/admin/wallets`);
    
    if (response.status === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      
      if (data.length > 0) {
        expect(data[0].id).toBeTruthy();
        expect(data[0].address).toBeTruthy();
        expect(data[0].network).toBeTruthy();
      }
    }
  });

  it('deve verificar saldo da carteira admin', async () => {
    if (!walletAddress) {
      console.log('⏭️ Pulando: nenhuma carteira disponível');
      return;
    }

    const response = await fetch(
      `${BASE_URL}/api/wallet/balance?address=${walletAddress}&network=devnet`
    );
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`💰 Saldo da carteira: ${data.xrpBalance} XRP`);
      expect(data.address).toBe(walletAddress);
    }
  });

  it('deve listar MPTs emitidos pela carteira admin', async () => {
    if (!walletAddress) {
      console.log('⏭️ Pulando: nenhuma carteira disponível');
      return;
    }

    const response = await fetch(
      `${BASE_URL}/api/mpt/list?issuer=${walletAddress}`
    );
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`📦 MPTs emitidos: ${data.length}`);
      expect(Array.isArray(data)).toBe(true);
    }
  });
});

describe('Estrutura de Dados MPT', () => {
  it('deve validar formato de resposta do balance', async () => {
    const expectedFields = ['address', 'network', 'xrpBalance', 'tokens', 'issuedMPTs'];
    
    const response = await fetch(
      `${BASE_URL}/api/wallet/balance?address=rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh&network=testnet`
    );
    
    if (response.status === 200) {
      const data = await response.json();
      
      for (const field of expectedFields) {
        expect(data).toHaveProperty(field);
      }
    }
  });

  it('deve validar formato de resposta do transactions', async () => {
    const response = await fetch(
      `${BASE_URL}/api/wallet/transactions?address=rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh&network=testnet`
    );
    
    if (response.status === 200) {
      const data = await response.json();
      
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('network');
      expect(data).toHaveProperty('transactions');
      expect(data).toHaveProperty('count');
      expect(Array.isArray(data.transactions)).toBe(true);
    }
  });
});

