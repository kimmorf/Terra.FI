# Erro ao Extrair Hash da Transação - Investimento

**Categoria:** TRANSFER  
**Severidade:** HIGH  
**Data:** 2024-12-19

## Descrição

Ao clicar em "Investir", aparece popup com erro "Não foi possível obter o hash da transação". O pagamento XRP é enviado via Crossmark, mas a extração do hash da resposta falha.

## Ambiente

- **Rede:** testnet
- **Navegador:** Chrome/Edge (com extensão Crossmark)
- **Timestamp:** 2024-12-19

## Comportamento Esperado

1. Usuário clica em "Investir"
2. Crossmark abre popup para assinar transação
3. Usuário aprova transação
4. Hash da transação é extraído da resposta
5. Investimento é registrado no banco com o hash

## Comportamento Observado

1. Usuário clica em "Investir"
2. Crossmark abre popup para assinar transação
3. Usuário aprova transação
4. ❌ Erro: "Não foi possível obter o hash da transação"
5. Investimento não é registrado

## Passos para Reproduzir

1. Conectar carteira Crossmark
2. Selecionar projeto de investimento
3. Inserir valor
4. Clicar em "Investir"
5. Aprovar transação no popup da Crossmark
6. Erro aparece após aprovação

## Análise Técnica

A função `extractTransactionHash` tenta múltiplos caminhos na resposta da Crossmark, mas a estrutura pode variar dependendo da versão do SDK ou do estado da transação.

### Código Atual

```typescript
export function extractTransactionHash(response: unknown): string | null {
  const obj = response as Record<string, any>;
  return (
    obj?.data?.hash ??
    obj?.data?.result?.hash ??
    obj?.data?.result?.tx_json?.hash ??
    obj?.data?.tx_json?.hash ??
    obj?.result?.hash ??
    null
  );
}
```

### Possíveis Causas

1. **Estrutura da resposta diferente**: A Crossmark pode retornar o hash em um caminho não coberto
2. **Transação ainda pendente**: O hash pode não estar disponível imediatamente
3. **Erro na transação**: A transação pode ter falhado mas a resposta não indica claramente
4. **Versão do SDK**: Diferentes versões do `@crossmarkio/sdk` podem ter estruturas diferentes

## Solução Implementada

1. ✅ Melhorada função `extractTransactionHash` com mais caminhos possíveis
2. ✅ Adicionados logs detalhados para debug
3. ✅ Tratamento de erros mais específico
4. ✅ Mensagens de erro mais descritivas

## Próximos Passos

1. Testar com diferentes versões do Crossmark SDK
2. Verificar logs do console para identificar estrutura exata da resposta
3. Adicionar fallback para calcular hash a partir de txBlob se necessário
4. Considerar usar `waitForConfirmation` para garantir que transação foi confirmada antes de extrair hash

## Logs Esperados

Ao reproduzir o erro, verificar no console do navegador:
- `[Investimento] Resposta do pagamento:` - estrutura completa da resposta
- `[extractTransactionHash] Estrutura da resposta:` - caminhos tentados
- `[extractTransactionHash] Hash não encontrado. Estrutura da resposta:` - análise da estrutura

---
*Gerado automaticamente em 2024-12-19*
