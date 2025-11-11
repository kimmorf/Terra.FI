# Guia de Uso: Multi-Purpose Tokens (MPT) na Terra.FI

## 📋 Índice

1. [O que são MPTs?](#o-que-são-mpts)
2. [Diferenças entre MPT e IOU](#diferenças-entre-mpt-e-iou)
3. [Fluxo Completo](#fluxo-completo)
4. [Exemplos de Código](#exemplos-de-código)
5. [Problemas Comuns](#problemas-comuns)

## O que são MPTs?

Multi-Purpose Tokens (MPT) são um novo padrão de token nativo do XRPL, introduzido para oferecer maior controle e compliance sobre ativos tokenizados.

### Características Principais:

- **Nativos do XRPL**: Não requerem smart contracts
- **Compliance Built-in**: Autorização, freeze, clawback nativos
- **Metadata On-chain**: Informações do token armazenadas no ledger
- **Identificador Único**: Cada MPT tem um `MPTokenIssuanceID` único

## Diferenças entre MPT e IOU

| Aspecto | IOU Tradicional | MPT |
|---------|----------------|-----|
| **Autorização** | `TrustSet` | `MPTokenAuthorize` |
| **Identificação** | Currency + Issuer | `MPTokenIssuanceID` |
| **Metadata** | Off-chain | On-chain (MPTokenMetadata) |
| **Transferência** | `Payment` (sempre) | `Payment` (se canTransfer=true) |
| **Compliance** | Limitado | Nativo (freeze, clawback) |

### ⚠️ IMPORTANTE: MPTs NÃO usam TrustSet!

```typescript
// ❌ ERRADO - MPT não usa TrustSet
await trustSetToken({
  account: holderAddress,
  currency: 'LAND',
  issuer: issuerAddress
});

// ✅ CORRETO - MPT usa MPTokenAuthorize
await authorizeMPTHolder({
  holderAddress: holderAddress,
  holderSeed: holderSeed,
  mptokenIssuanceID: '00000A1B2C3D4E5F...'
});
```

## Fluxo Completo

### 1. Emissor: Criar MPT

```typescript
import { createMPT } from '@/lib/xrpl/mpt-helpers';

const result = await createMPT({
  issuerAddress: 'rIssuerXXXXXXXXXXXXXXXXXXXXX',
  issuerSeed: 'sIssuerXXXXXXXXXXXXXXXXXXXXX',
  assetScale: 2, // 2 casas decimais (ex: 100 = 1.00)
  maximumAmount: '1000000', // Máximo de 1 milhão
  transferFee: 100, // 1% de taxa (100 basis points)
  metadata: {
    name: 'LAND Token',
    symbol: 'LAND',
    description: 'Tokenized land parcel in São Paulo',
    location: 'São Paulo, Brazil',
    legalReference: 'Registry #12345',
    image: 'https://example.com/land.jpg'
  },
  flags: {
    requireAuth: true,    // Holder precisa ser autorizado
    canTransfer: true,    // Permite transferências entre holders
    canTrade: true,       // Permite negociar no DEX
    canClawback: true     // Emissor pode resgatar tokens
  },
  network: 'testnet'
});

console.log('MPTokenIssuanceID:', result.mptokenIssuanceID);
// Salvar este ID! Será usado em todas as operações com o token
```

### 2. Holder: Autorizar-se para Receber MPT

**IMPORTANTE**: O holder precisa executar esta ação, não o emissor!

```typescript
import { authorizeMPTHolder } from '@/lib/xrpl/mpt-helpers';

// Holder autoriza a si mesmo para receber o MPT
const txHash = await authorizeMPTHolder({
  holderAddress: 'rHolderXXXXXXXXXXXXXXXXXXXXX',
  holderSeed: 'sHolderXXXXXXXXXXXXXXXXXXXXX',
  mptokenIssuanceID: '00000A1B2C3D4E5F...', // ID do passo 1
  authorize: true, // true = autorizar, false = desautorizar
  network: 'testnet'
});

console.log('Holder autorizado! Hash:', txHash);
```

### 3. Verificar Autorização

```typescript
import { isHolderAuthorized } from '@/lib/xrpl/mpt-helpers';

const isAuthorized = await isHolderAuthorized(
  'rHolderXXXXXXXXXXXXXXXXXXXXX',
  '00000A1B2C3D4E5F...',
  'testnet'
);

if (isAuthorized) {
  console.log('Holder está autorizado a receber o MPT');
} else {
  console.log('Holder precisa se autorizar primeiro');
}
```

### 4. Emissor: Enviar MPT para Holder

```typescript
import { sendMPT } from '@/lib/xrpl/mpt-helpers';

const txHash = await sendMPT({
  fromAddress: 'rIssuerXXXXXXXXXXXXXXXXXXXXX',
  fromSeed: 'sIssuerXXXXXXXXXXXXXXXXXXXXX',
  toAddress: 'rHolderXXXXXXXXXXXXXXXXXXXXX',
  mptokenIssuanceID: '00000A1B2C3D4E5F...',
  amount: '100.00', // 100 tokens (com 2 casas decimais)
  memo: 'Initial distribution',
  network: 'testnet'
});

console.log('MPT enviado! Hash:', txHash);
```

### 5. Verificar Saldo

```typescript
import { getMPTBalance } from '@/lib/xrpl/mpt-helpers';

const balance = await getMPTBalance(
  'rHolderXXXXXXXXXXXXXXXXXXXXX',
  '00000A1B2C3D4E5F...',
  'testnet'
);

console.log('Saldo do holder:', balance);
```

### 6. Holder: Transferir MPT para Outro Holder

**IMPORTANTE**: Ambos os holders devem estar autorizados primeiro!

```typescript
import { sendMPT } from '@/lib/xrpl/mpt-helpers';

// Holder 2 precisa se autorizar primeiro
await authorizeMPTHolder({
  holderAddress: 'rHolder2XXXXXXXXXXXXXXXXXXXXX',
  holderSeed: 'sHolder2XXXXXXXXXXXXXXXXXXXXX',
  mptokenIssuanceID: '00000A1B2C3D4E5F...',
  authorize: true,
  network: 'testnet'
});

// Holder 1 envia para Holder 2
const txHash = await sendMPT({
  fromAddress: 'rHolder1XXXXXXXXXXXXXXXXXXXXX',
  fromSeed: 'sHolder1XXXXXXXXXXXXXXXXXXXXX',
  toAddress: 'rHolder2XXXXXXXXXXXXXXXXXXXXX',
  mptokenIssuanceID: '00000A1B2C3D4E5F...',
  amount: '50.00',
  memo: 'Transfer between holders',
  network: 'testnet'
});

console.log('Transferência concluída! Hash:', txHash);
```

## Exemplos de Código

### Criar MPT Simples (sem permissões)

```typescript
// MPT sem requireAuth - qualquer um pode receber
const result = await createMPT({
  issuerAddress: issuerAddress,
  issuerSeed: issuerSeed,
  assetScale: 0, // Sem casas decimais
  maximumAmount: '0', // Sem limite
  metadata: {
    name: 'Simple Token',
    symbol: 'SIMP'
  },
  flags: {
    requireAuth: false, // Sem autorização necessária
    canTransfer: true,
    canTrade: true
  },
  network: 'testnet'
});
```

### Criar MPT com Compliance Rigoroso

```typescript
// MPT para securities - controle total do emissor
const result = await createMPT({
  issuerAddress: issuerAddress,
  issuerSeed: issuerSeed,
  assetScale: 6, // Alta precisão
  maximumAmount: '1000000.000000',
  transferFee: 50, // 0.5% de taxa
  metadata: {
    name: 'Real Estate Security Token',
    symbol: 'REST',
    description: 'Fractionalized commercial real estate',
    assetClass: 'security',
    regulatoryFramework: 'SEC Reg D',
    isin: 'US1234567890'
  },
  flags: {
    requireAuth: true,    // KYC obrigatório
    canTransfer: false,   // Apenas via DEX/Emissor
    canTrade: true,       // Permite DEX
    canClawback: true,    // Compliance enforcement
    canLock: true         // Períodos de lock-up
  },
  network: 'testnet'
});
```

### Usar na Frontend com Crossmark

```typescript
// ⚠️ LIMITAÇÃO: Crossmark SDK pode não suportar MPT ainda
// Use API routes no backend para operações com MPT

// app/api/mpt/authorize/route.ts
export async function POST(request: Request) {
  const { holderAddress, mptokenIssuanceID, holderSeed } = await request.json();
  
  const txHash = await authorizeMPTHolder({
    holderAddress,
    holderSeed, // Em produção, usar outro método seguro
    mptokenIssuanceID,
    authorize: true,
    network: 'testnet'
  });
  
  return Response.json({ success: true, txHash });
}

// Frontend
const response = await fetch('/api/mpt/authorize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    holderAddress: account.address,
    mptokenIssuanceID: selectedToken.id,
    holderSeed: userSeed // NUNCA armazene seed no frontend em produção!
  })
});
```

## Problemas Comuns

### 1. "Crossmark não suporta TrustSet"

**Solução**: MPTs não usam TrustSet! Use `MPTokenAuthorize` via API route.

```typescript
// ❌ Não tente usar trustSetToken para MPT
// ✅ Use authorizeMPTHolder ou API route
```

### 2. "Holder não autorizado"

**Problema**: Tentou enviar MPT para holder que não se autorizou.

**Solução**: Holder precisa executar `MPTokenAuthorize` primeiro.

```typescript
// Verificar antes de enviar
const isAuth = await isHolderAuthorized(holderAddress, mptID, network);
if (!isAuth) {
  throw new Error('Holder precisa se autorizar primeiro');
}
```

### 3. "Cannot transfer MPT"

**Problema**: MPT foi criado com `canTransfer: false`.

**Solução**: Verificar flags do MPT ou apenas emissor pode distribuir.

```typescript
const mptInfo = await getMPTInfo(mptokenIssuanceID, network);
const canTransfer = (mptInfo.Flags & 0x00000020) !== 0;
```

### 4. "MPTokenIssuanceID not found"

**Problema**: ID não foi extraído corretamente após criação.

**Solução**: Verificar meta da transação e AffectedNodes.

```typescript
// Sempre salvar o MPTokenIssuanceID após criação
const { mptokenIssuanceID } = await createMPT({...});
// Salvar no banco de dados imediatamente
await db.token.create({ data: { mptokenIssuanceID, ... }});
```

## Referências

- [XRPL.js Documentation](https://js.xrpl.org/)
- [XRPL MPT Specification](https://xrpl.org/mptokenissuancecreate.html)
- [XRPL Dev Portal - MPT Example](https://github.com/XRPLF/xrpl-dev-portal/blob/master/_code-samples/issue-mpt-with-metadata/js/issue-mpt-with-metadata.js)
- [Terra.FI Implementation](https://github.com/terra-fi/terra-fi)

## Próximos Passos

1. **Implementar no Frontend**: Criar UI para autorização de MPT
2. **API Routes**: Endpoints seguros para operações com seed
3. **Monitoring**: Dashboard para visualizar MPTs emitidos
4. **DEX Integration**: Negociação de MPT no XRPL DEX
5. **Advanced Features**: Freeze, clawback, lock-up periods

