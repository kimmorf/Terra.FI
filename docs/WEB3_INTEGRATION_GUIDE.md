# 🌐 Guia de Integração Web3 - Terra.FI

## 📋 Visão Geral

Este guia cobre todas as funcionalidades Web3 implementadas na plataforma Terra.FI, incluindo:

1. **Conexão com Carteira** (Crossmark)
2. **Criação de Trustlines** (para stablecoins/IOUs)
3. **Autorização de MPT** (Multi-Purpose Tokens)
4. **Transferências** (XRP, IOUs e MPT)
5. **Operações no DEX**

## 🔌 1. Conexão com Carteira Crossmark

### Frontend - Usar o Hook `useCrossmark`

```tsx
import { useCrossmark } from '@/lib/crossmark/useCrossmark';

function MyComponent() {
  const {
    isConnected,
    isInstalled,
    isLoading,
    account,
    error,
    connect,
    disconnect,
    refreshAccount
  } = useCrossmark();

  const handleConnect = async () => {
    const success = await connect();
    if (success) {
      console.log('Conectado:', account?.address);
      console.log('Network:', account?.network);
    }
  };

  return (
    <div>
      {!isConnected ? (
        <button onClick={handleConnect} disabled={isLoading}>
          {isLoading ? 'Conectando...' : 'Conectar Crossmark'}
        </button>
      ) : (
        <div>
          <p>Endereço: {account?.address}</p>
          <p>Network: {account?.network}</p>
          <button onClick={disconnect}>Desconectar</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

### Context Provider - Disponível Globalmente

```tsx
// app/layout.tsx ou app/providers.tsx
import { CrossmarkProvider } from '@/lib/crossmark/CrossmarkProvider';

export function Providers({ children }) {
  return (
    <CrossmarkProvider>
      {children}
    </CrossmarkProvider>
  );
}

// Qualquer componente filho
import { useCrossmarkContext } from '@/lib/crossmark/CrossmarkProvider';

function AnyComponent() {
  const { account, isConnected } = useCrossmarkContext();
  // ...
}
```

## 💰 2. Operações com XRP Nativo

### Enviar XRP

```typescript
import { sendXRPPayment } from '@/lib/crossmark/transactions';

// Via Crossmark (frontend)
const response = await sendXRPPayment({
  sender: account.address,
  destination: 'rDestinationXXXXXXXXXXXXXXXXX',
  amount: '10', // 10 XRP
  memo: 'Pagamento de teste'
});

const txHash = extractTransactionHash(response);
console.log('Transação enviada:', txHash);
```

### Verificar Saldo XRP

```typescript
import { Client } from 'xrpl';

const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();

const response = await client.request({
  command: 'account_info',
  account: account.address,
  ledger_index: 'validated'
});

const balanceDrops = response.result.account_data.Balance;
const balanceXRP = parseInt(balanceDrops) / 1000000;
console.log('Saldo:', balanceXRP, 'XRP');

await client.disconnect();
```

## 🪙 3. Operações com IOUs (Stablecoins/Tokens Tradicionais)

### 3.1. Criar Trustline (TrustSet)

⚠️ **IMPORTANTE**: A extensão Crossmark **NÃO suporta TrustSet** atualmente!

**Opção 1: Via API Route (Recomendado)**

```typescript
// Frontend - Chamar API route
const response = await fetch('/api/xrpl/trustline', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    account: account.address,
    currency: 'RLUSD',
    issuer: 'rRippleIssuedStablecoinXXXXXXXXXX',
    limit: '1000000',
    network: 'testnet',
    seed: userSeed // ⚠️ Ver nota de segurança abaixo
  })
});

const data = await response.json();
console.log('Trustline criada:', data.txHash);
```

**⚠️ SEGURANÇA**: Nunca exponha a seed no frontend em produção!

Alternativas seguras:
1. **xumm.app** - App mobile com assinatura segura
2. **xrptoolkit.com** - Interface web completa
3. **Carteira física** - Ledger/Trezor

**Opção 2: Crossmark com Seed (apenas desenvolvimento)**

```typescript
import { trustSetTokenWithSeed } from '@/lib/crossmark/transactions';

const result = await trustSetTokenWithSeed({
  account: account.address,
  currency: 'RLUSD',
  issuer: 'rRippleIssuedStablecoinXXXXXXXXXX',
  limit: '1000000',
  seed: userSeed, // ⚠️ Apenas para desenvolvimento/teste
  network: 'testnet'
});
```

### 3.2. Verificar Trustline

```typescript
import { hasTrustLine } from '@/lib/xrpl/mpt';

const hasTrust = await hasTrustLine({
  account: account.address,
  currency: 'RLUSD',
  issuer: 'rRippleIssuedStablecoinXXXXXXXXXX',
  network: 'testnet'
});

console.log('Tem trustline?', hasTrust);
```

### 3.3. Verificar Saldo de IOU

```typescript
import { getAccountBalance } from '@/lib/xrpl/mpt';

const balance = await getAccountBalance({
  account: account.address,
  currency: 'RLUSD',
  issuer: 'rRippleIssuedStablecoinXXXXXXXXXX',
  network: 'testnet'
});

console.log('Saldo:', balance, 'RLUSD');
```

### 3.4. Enviar IOU

```typescript
import { sendMPToken, extractTransactionHash } from '@/lib/crossmark/transactions';

// Via Crossmark (funciona para IOUs, não para MPT!)
const response = await sendMPToken({
  sender: account.address,
  destination: 'rDestinationXXXXXXXXXXXXXXXXX',
  amount: '100',
  currency: 'RLUSD',
  issuer: 'rRippleIssuedStablecoinXXXXXXXXXX',
  memo: 'Payment for land'
});

const txHash = extractTransactionHash(response);
console.log('IOU enviado:', txHash);
```

## 🏗️ 4. Operações com MPT (Multi-Purpose Tokens)

### 4.1. Criar MPT (Emissor)

```typescript
// Via API Route
const response = await fetch('/api/mpt/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    issuerAddress: 'rIssuerXXXXXXXXXXXXXXXXXXXXX',
    issuerSeed: 'sIssuerXXXXXXXXXXXXXXXXXXXXX',
    assetScale: 2, // 2 casas decimais
    maximumAmount: '1000000',
    transferFee: 100, // 1% = 100 basis points
    metadata: {
      name: 'LAND Token',
      symbol: 'LAND',
      description: 'Tokenized land parcel',
      location: 'São Paulo, Brazil'
    },
    flags: {
      requireAuth: true,
      canTransfer: true,
      canTrade: true,
      canClawback: true
    },
    network: 'testnet'
  })
});

const data = await response.json();
console.log('MPT criado!');
console.log('MPTokenIssuanceID:', data.mptokenIssuanceID);
console.log('Transaction Hash:', data.txHash);

// ⚠️ IMPORTANTE: Salvar o MPTokenIssuanceID no banco de dados!
// Este ID será usado em TODAS as operações com o MPT
```

### 4.2. Autorizar Holder (Holder se autoriza)

**IMPORTANTE**: O holder precisa executar esta ação, não o emissor!

```typescript
// Via API Route
const response = await fetch('/api/mpt/authorize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    holderAddress: account.address,
    holderSeed: holderSeed, // ⚠️ Ver nota de segurança
    mptokenIssuanceID: '00000A1B2C3D4E5F...', // ID do MPT
    authorize: true, // true = autorizar, false = desautorizar
    network: 'testnet'
  })
});

const data = await response.json();
console.log('Holder autorizado! Hash:', data.txHash);
```

### 4.3. Verificar Autorização

```typescript
// Via API Route (GET)
const response = await fetch(
  `/api/mpt/info?mptokenIssuanceID=${mptID}&holderAddress=${account.address}&network=testnet`
);

const data = await response.json();
console.log('Autorizado?', data.holderInfo.authorized);
console.log('Saldo:', data.holderInfo.balance);
```

### 4.4. Enviar MPT

```typescript
// Via API Route
const response = await fetch('/api/mpt/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromAddress: account.address,
    fromSeed: userSeed, // ⚠️ Ver nota de segurança
    toAddress: 'rDestinationXXXXXXXXXXXXXXXXX',
    mptokenIssuanceID: '00000A1B2C3D4E5F...',
    amount: '100.00',
    memo: 'Transfer of land tokens',
    network: 'testnet'
  })
});

const data = await response.json();
console.log('MPT enviado! Hash:', data.txHash);
```

### 4.5. Buscar Informações do MPT

```typescript
import { getMPTInfo } from '@/lib/xrpl/mpt-helpers';

const mptInfo = await getMPTInfo('00000A1B2C3D4E5F...', 'testnet');

console.log('Emissor:', mptInfo.Issuer);
console.log('AssetScale:', mptInfo.AssetScale);
console.log('MaximumAmount:', mptInfo.MaximumAmount);
console.log('Flags:', mptInfo.Flags);
```

### 4.6. Buscar Saldo de MPT

```typescript
import { getMPTBalance } from '@/lib/xrpl/mpt-helpers';

const balance = await getMPTBalance(
  account.address,
  '00000A1B2C3D4E5F...',
  'testnet'
);

console.log('Saldo:', balance);
```

## 📊 5. Operações no DEX

### 5.1. Criar Oferta de Compra

```typescript
import { createOffer } from '@/lib/xrpl/dex';

// Comprar LAND com RLUSD
const txHash = await createOffer({
  account: account.address,
  takerGets: { // O que você quer receber
    currency: 'LAND',
    issuer: 'rLandIssuerXXXXXXXXXXXXXXXXX',
    value: '100' // 100 LAND
  },
  takerPays: { // O que você vai pagar
    currency: 'RLUSD',
    issuer: 'rRLUSDIssuerXXXXXXXXXXXXXXXXX',
    value: '105' // 105 RLUSD (preço: 1.05 RLUSD por LAND)
  },
  network: 'testnet'
});

console.log('Oferta criada! Hash:', txHash);
```

### 5.2. Criar Oferta de Venda

```typescript
import { createOffer } from '@/lib/xrpl/dex';

// Vender LAND por RLUSD
const txHash = await createOffer({
  account: account.address,
  takerGets: { // O que você quer receber
    currency: 'RLUSD',
    issuer: 'rRLUSDIssuerXXXXXXXXXXXXXXXXX',
    value: '95' // 95 RLUSD
  },
  takerPays: { // O que você vai pagar (vender)
    currency: 'LAND',
    issuer: 'rLandIssuerXXXXXXXXXXXXXXXXX',
    value: '100' // 100 LAND (preço: 0.95 RLUSD por LAND)
  },
  network: 'testnet'
});

console.log('Oferta criada! Hash:', txHash);
```

### 5.3. Listar Minhas Ofertas

```typescript
import { getAccountOffers } from '@/lib/xrpl/dex';

const offers = await getAccountOffers(account.address, 'testnet');

offers.forEach(offer => {
  console.log('Oferta:', {
    sequence: offer.sequence,
    takerGets: offer.takerGets,
    takerPays: offer.takerPays,
    rate: offer.rate
  });
});
```

### 5.4. Cancelar Oferta

```typescript
import { cancelOffer } from '@/lib/xrpl/dex';

const txHash = await cancelOffer(
  account.address,
  12345, // Sequence da oferta
  'testnet'
);

console.log('Oferta cancelada! Hash:', txHash);
```

### 5.5. Buscar Ofertas do Book

```typescript
import { getBookOffers } from '@/lib/xrpl/dex';

const offers = await getBookOffers(
  { currency: 'LAND', issuer: 'rLandIssuerXXXXXXXXXXXXXXXXX' }, // Taker Gets
  { currency: 'RLUSD', issuer: 'rRLUSDIssuerXXXXXXXXXXXXXXXXX' }, // Taker Pays
  'testnet',
  20 // Limite de ofertas
);

console.log('Ofertas no book:', offers.length);
offers.forEach(offer => {
  console.log('Oferta:', {
    account: offer.account,
    quality: offer.quality,
    takerGets: offer.takerGetsValue,
    takerPays: offer.takerPaysValue
  });
});
```

## 🔐 6. Segurança e Boas Práticas

### 6.1. Nunca Exponha Seeds no Frontend

```typescript
// ❌ ERRADO - Nunca faça isso em produção
const seed = 'sXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
localStorage.setItem('seed', seed);

// ✅ CORRETO - Use API routes no backend
// Backend tem acesso seguro às seeds (env vars, KMS, etc)
```

### 6.2. Validar Sempre os Inputs

```typescript
// Validar endereços
function isValidXRPLAddress(address: string): boolean {
  return address.startsWith('r') && address.length >= 25;
}

// Validar valores
function isValidAmount(amount: string): boolean {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

// Usar antes de enviar transações
if (!isValidXRPLAddress(destination)) {
  throw new Error('Endereço de destino inválido');
}

if (!isValidAmount(amount)) {
  throw new Error('Valor inválido');
}
```

### 6.3. Tratar Erros Adequadamente

```typescript
try {
  const response = await sendMPToken({...});
  const txHash = extractTransactionHash(response);
  
  if (!txHash) {
    throw new Error('Hash da transação não encontrado');
  }
  
  // Sucesso
  showSuccessMessage(`Transação enviada: ${txHash}`);
} catch (error: any) {
  // Erros comuns
  if (error.message.includes('rejected')) {
    showErrorMessage('Transação cancelada pelo usuário');
  } else if (error.message.includes('insufficient')) {
    showErrorMessage('Saldo insuficiente');
  } else if (error.message.includes('not authorized')) {
    showErrorMessage('Você precisa autorizar o token primeiro');
  } else {
    showErrorMessage(`Erro: ${error.message}`);
  }
}
```

### 6.4. Usar Feedback Visual

```tsx
function TransferComponent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTransfer = async () => {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    
    try {
      const txHash = await sendMPT({...});
      setMessage(`Sucesso! Hash: ${txHash}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <button onClick={handleTransfer} disabled={isSubmitting}>
        {isSubmitting ? 'Enviando...' : 'Enviar'}
      </button>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

## 🧪 7. Testando no Testnet

### 7.1. Criar Conta de Teste

```typescript
import { Client, Wallet } from 'xrpl';

const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();

// Criar e financiar conta
const { wallet, balance } = await client.fundWallet();

console.log('Endereço:', wallet.address);
console.log('Seed:', wallet.seed);
console.log('Saldo:', balance, 'XRP');

await client.disconnect();

// ⚠️ SALVE A SEED! Você precisará dela para todas as operações
```

### 7.2. Faucet Testnet

Se precisar de mais XRP de teste:
- https://faucet.altnet.rippletest.net/
- https://xrpl.org/xrp-testnet-faucet.html

### 7.3. Explorador Testnet

Verificar transações:
- https://testnet.xrpl.org/
- https://test.bithomp.com/explorer/

## 📚 8. Recursos Adicionais

### Documentação Oficial

- [XRPL.js Documentation](https://js.xrpl.org/)
- [XRPL Dev Portal](https://xrpl.org/)
- [Crossmark SDK](https://github.com/crossmarkio/sdk)

### Exemplos de Código

- [Terra.FI MPT Implementation](./MPT_USAGE_GUIDE.md)
- [XRPL MPT Example](https://github.com/XRPLF/xrpl-dev-portal/blob/master/_code-samples/issue-mpt-with-metadata/js/issue-mpt-with-metadata.js)

### Ferramentas

- **XRPL Testnet Faucet**: https://faucet.altnet.rippletest.net/
- **Bithomp Explorer**: https://bithomp.com/
- **XRP Toolkit**: https://xrptoolkit.com/
- **Xumm Wallet**: https://xumm.app/

## ⚡ 9. Fluxo Completo Exemplo

### Cenário: Comprar Token LAND com RLUSD

```typescript
// 1. Conectar Crossmark
const { connect, account } = useCrossmark();
await connect();

// 2. Criar trustline para RLUSD (via API)
const trustlineResponse = await fetch('/api/xrpl/trustline', {
  method: 'POST',
  body: JSON.stringify({
    account: account.address,
    currency: 'RLUSD',
    issuer: RLUSD_ISSUER,
    seed: userSeed, // ⚠️ Apenas desenvolvimento
    network: 'testnet'
  })
});

// 3. Verificar se já tem trustline do LAND
const hasLandTrust = await hasTrustLine({
  account: account.address,
  currency: 'LAND',
  issuer: LAND_ISSUER,
  network: 'testnet'
});

// 4. Se não tem, criar trustline do LAND (via API)
if (!hasLandTrust) {
  await fetch('/api/xrpl/trustline', {
    method: 'POST',
    body: JSON.stringify({
      account: account.address,
      currency: 'LAND',
      issuer: LAND_ISSUER,
      seed: userSeed,
      network: 'testnet'
    })
  });
}

// 5. Criar oferta de compra no DEX
const txHash = await createOffer({
  account: account.address,
  takerGets: {
    currency: 'LAND',
    issuer: LAND_ISSUER,
    value: '100' // Quero 100 LAND
  },
  takerPays: {
    currency: 'RLUSD',
    issuer: RLUSD_ISSUER,
    value: '105' // Pago 105 RLUSD (preço: 1.05)
  },
  network: 'testnet'
});

console.log('Oferta criada! Hash:', txHash);

// 6. Monitorar execução da oferta
// A oferta será executada automaticamente quando alguém vender LAND
// por <= 1.05 RLUSD
```

## 🎯 10. Checklist de Integração

Antes de ir para produção:

- [ ] Implementar gestão segura de seeds (nunca no frontend!)
- [ ] Adicionar validação de inputs em todos os formulários
- [ ] Implementar tratamento de erros robusto
- [ ] Adicionar logs e monitoramento
- [ ] Testar todos os fluxos no testnet
- [ ] Implementar rate limiting nas API routes
- [ ] Adicionar autenticação nas API routes sensíveis
- [ ] Documentar todos os endpoints
- [ ] Criar testes automatizados
- [ ] Realizar auditoria de segurança

---

**Dúvidas?** Consulte:
- [MPT Usage Guide](./MPT_USAGE_GUIDE.md)
- [XRPL Best Practices](./XRPL_JS_BEST_PRACTICES.md)
- [Error Handling Guide](./errors/README.md)

