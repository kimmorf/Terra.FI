# 🧪 Sistema de Testes e Reporte de Erros

## Estrutura Implementada

### 1. Categorização de Erros (`lib/errors/error-categorizer.ts`)

Sistema que categoriza automaticamente erros e gera arquivos `ERROR_<CATEGORIA>.MD`:

**Categorias:**
- `ERROR_TRANSFER.MD` - Falhas no envio MPT
- `ERROR_LOGIN.MD` - Erros Crossmark, token inválido, sessão expirada
- `ERROR_MPT_LOCK.MD` - Falha no freeze/issue do colateral
- `ERROR_UI_STATE.MD` - Front inconsistente, travado, input incorreto
- `ERROR_DEX.MD` - Erros de DEX/trading
- `ERROR_COLLATERAL.MD` - Erros de colateralização
- `ERROR_AUTH.MD` - Erros de autenticação
- `ERROR_XRPL.MD` - Erros do XRPL
- `ERROR_API.MD` - Erros de API
- `ERROR_DATABASE.MD` - Erros de banco de dados
- `ERROR_SECURITY.MD` - Erros de segurança
- `ERROR_UNKNOWN.MD` - Erros não categorizados

**Uso:**
```typescript
import { reportError } from '@/lib/errors/error-categorizer';

try {
  // código que pode falhar
} catch (error) {
  const filepath = await reportError(error, {
    operation: 'transfer',
    walletAddress: 'r...',
    txHash: '...',
    network: 'testnet',
  });
  // Erro será categorizado e salvo em ERROR_TRANSFER.MD
}
```

### 2. Auditoria de Incidentes Críticos (`lib/audit/incident-auditor.ts`)

Sistema que:
- Detecta erros críticos (bloqueio de transação, vazamento de dados)
- Valida logs para dados sensíveis
- Gera post-mortem padronizado
- Assina digitalmente e arquiva em `/audit/incidents/`

**Uso:**
```typescript
import { auditCriticalIncident } from '@/lib/audit/incident-auditor';

try {
  // operação crítica
} catch (error) {
  const postMortemPath = await auditCriticalIncident(
    error,
    {
      operation: 'freeze',
      issuer: 'r...',
      holder: 'r...',
      transactionBlocked: true,
    },
    {
      resolvedAt: new Date().toISOString(),
      actionsTaken: [
        'Verificado saldo',
        'Reenviado transação',
      ],
      preventiveAction: 'Adicionar validação prévia de saldo',
    }
  );
}
```

### 3. Detecção de Dados Sensíveis

O sistema detecta automaticamente:
- Chaves privadas
- Secrets
- Passwords
- Tokens
- Credenciais
- Seeds/Mnemonics

E remove esses dados do contexto antes de salvar logs.

## Estrutura de Diretórios

```
docs/
  errors/
    ERROR_TRANSFER.MD
    ERROR_LOGIN.MD
    ERROR_MPT_LOCK.MD
    ERROR_UI_STATE.MD
    ...

audit/
  incidents/
    post-mortem-<ID>-<DATE>.md
    CRITICAL_INCIDENTS.log
```

## Próximos Passos

1. ✅ Sistema de categorização implementado
2. ✅ Sistema de auditoria implementado
3. ⏳ Integrar em pontos críticos do código
4. ⏳ Criar dashboard de monitoramento
5. ⏳ Configurar alertas para incidentes críticos

## Exemplos de Uso

### Reportar Erro Simples

```typescript
import { reportError } from '@/lib/errors/error-categorizer';

await reportError(
  new Error('Transfer failed'),
  {
    operation: 'transfer',
    walletAddress: 'rWallet...',
    amount: '100',
    currency: 'LAND',
  }
);
```

### Auditar Incidente Crítico

```typescript
import { auditCriticalIncident } from '@/lib/audit/incident-auditor';

await auditCriticalIncident(
  error,
  {
    operation: 'freeze',
    issuer: 'rIssuer...',
    transactionBlocked: true,
    walletAddress: 'rWallet...',
  },
  {
    resolvedAt: new Date().toISOString(),
    actionsTaken: ['Ação 1', 'Ação 2'],
    preventiveAction: 'Melhorar validação',
  }
);
```
