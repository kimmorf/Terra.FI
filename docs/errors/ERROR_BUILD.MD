# 🚨 ERROR_BUILD

**Severidade:** HIGH  
**Data/Hora:** 2024-12-19  
**Categoria:** BUILD

## Descrição

Erro de compilação TypeScript: `reliableSubmitV2` espera `txBlob: string` mas está recebendo objeto de transação.

## Contexto

- **Arquivo:** `lib/xrpl/atomic-col.ts:82`
- **Arquivo:** `lib/xrpl/authorize-lock.ts:154`
- **Erro:** `Argument of type '{ TransactionType: string; ... }' is not assignable to parameter of type 'string'`

## Stack Trace

```
./lib/xrpl/atomic-col.ts:82:47
Type error: Argument of type '{ TransactionType: string; Account: string; Currency: string; Holder: string; Freeze: boolean; }' is not assignable to parameter of type 'string'.
```

## Ações Recomendadas

1. ✅ Criar função helper `prepareAndSignTransaction` para preparar e assinar transações
2. ✅ Corrigir `atomic-col.ts` para usar `prepareAndSignTransaction` antes de chamar `reliableSubmit`
3. ⏳ Verificar `authorize-lock.ts` - pode precisar de abordagem diferente se usa Crossmark
4. ⏳ Adicionar `issuerSeed` como parâmetro obrigatório onde necessário
5. ⏳ Testar build após correções

## Status

- ✅ `transaction-helper.ts` criado
- ✅ `atomic-col.ts` corrigido (parcialmente)
- ⏳ `authorize-lock.ts` pendente de correção
- ⏳ Build ainda falhando

## Notas

O problema é que `reliableSubmitV2` espera uma transação já assinada (txBlob), mas o código estava passando objetos de transação não assinados. A solução é preparar e assinar as transações antes de submeter.
