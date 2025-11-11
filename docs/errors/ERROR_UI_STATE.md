# ERROR_UI_STATE

## 📋 Resumo
Erro de compilação TypeScript: Property 'issuanceIdHex' não existe no tipo Purchase

## 🎯 Criticidade
🚨 Critical

## 🔍 Detalhes
- **Quando ocorre:** Durante build do projeto (npm run build)
- **Frequência:** always
- **Impacto:** Build falha, impedindo deploy e desenvolvimento
- **Componente afetado:** lib/purchase/purchase.service.ts

## 📊 Evidências
- **TX Hash:** N/A
- **Timestamp:** 2025-01-27T10:30:00Z
- **Network:** N/A (build time)
- **Payload:** 
  ```typescript
  // lib/purchase/purchase.service.ts:322
  const mptTxHash = await this.sendMPTToBuyer(
    purchase.issuanceIdHex,  // ❌ Property não existe
    purchase.buyerAddress,
    purchase.quantity,
    purchase.id
  );
  ```

## 🔄 Passos para Reproduzir
1. Executar `npm run build`
2. TypeScript compila e encontra erro na linha 322
3. Build falha com erro de tipo

## 🧪 Teste Relacionado
- **Script:** run-validation-pipeline.ts
- **Cenário:** Build do projeto
- **Comando:** `npm run validate:pipeline`

## ✅ Status
- [x] Identificado
- [ ] Em análise
- [ ] Em correção
- [ ] Resolvido
- [ ] Testado

**Status atual:** Identificado
**Data identificação:** 2025-01-27
**Data resolução:** 
**Commit:** 
**PR:** 

## 🛠️ Solução
[Aguardando correção]

**Possíveis soluções:**
1. Verificar schema do Prisma para campo `issuanceIdHex`
2. Adicionar campo ao modelo Purchase se necessário
3. Usar campo alternativo se `issuanceIdHex` não existe
4. Verificar se o campo foi renomeado ou removido

## 📚 Referências
- Arquivo: lib/purchase/purchase.service.ts:322
- Schema: prisma/schema.prisma
- Teste relacionado: validate-all-features.ts

## 👤 Atribuído a
[Aguardando atribuição]

## 📝 Notas Adicionais
Este erro bloqueia todo o pipeline de validação. Prioridade máxima para correção.
