# Análise: Emissão de MPT - Inconsistências Encontradas

**Categoria:** TRANSFER  
**Severidade:** HIGH  
**Data:** 2024-12-19

## Problema Identificado

Existem **duas implementações diferentes** para `MPTokenIssuanceCreate` no código:

### Implementação 1: `lib/crossmark/transactions.ts`
```typescript
{
  TransactionType: 'MPTokenIssuanceCreate',
  Account: issuer,
  Currency: currency.toUpperCase(),
  Amount: amount,
  Decimals: decimals,
  Transferable: transferable,
  Memos: [buildMetadataMemo(metadata)] // XLS-89 em Memos
}
```

### Implementação 2: `lib/mpt/mpt.service.ts`
```typescript
{
  TransactionType: 'MPTokenIssuanceCreate',
  Account: issuer.address,
  AssetScale: dto.assetScale ?? 0,
  MaximumAmount: dto.maximumAmount ?? '0',
  TransferFee: dto.transferFee ?? 0,
  MPTokenMetadata: MPTokenMetadata, // Hex direto
  Flags: flags
}
```

## Análise da Documentação XRPL

Segundo a documentação oficial do XRPL, `MPTokenIssuanceCreate` deve usar:
- `AssetScale` (não `Decimals`)
- `MaximumAmount` (não `Amount`)
- `TransferFee` (em basis points)
- `MPTokenMetadata` (campo dedicado, não em Memos)
- `Flags` para configurações (RequireAuth, CanTransfer, etc.)

## Problemas Encontrados

1. ❌ **Campo `Currency` não existe** em MPTokenIssuanceCreate
2. ❌ **Campo `Amount` não existe** - deve ser `MaximumAmount`
3. ❌ **Campo `Decimals` não existe** - deve ser `AssetScale`
4. ❌ **Campo `Transferable` não existe** - deve ser flag `CanTransfer`
5. ⚠️ **Metadados XLS-89** - pode ir em `MPTokenMetadata` OU em `Memos`, mas não ambos

## Impacto

- A implementação em `lib/crossmark/transactions.ts` está **incorreta** e não funcionará
- A implementação em `lib/mpt/mpt.service.ts` está **mais próxima** do correto, mas precisa verificação

## Solução Necessária

1. Corrigir `buildMPTokenIssuanceTransaction` para usar campos corretos
2. Unificar as duas implementações
3. Verificar formato de metadados XLS-89

---
*Gerado automaticamente em 2024-12-19*
