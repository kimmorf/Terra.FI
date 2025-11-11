# Bugs Identificados

## ✅ Resolvidos

### 1. Loop infinito ao carregar tokens quando usuário não tem tokens
**Status:** ✅ RESOLVIDO  
**Data:** $(date)  
**Descrição:** Quando o usuário não tinha tokens MPT, o componente ficava em loop tentando carregar constantemente, causando piscamento na interface.

**Solução Implementada:**
- Adicionado flag `hasLoadedTokens` para controlar se os dados já foram carregados
- Prevenção de recarregamento múltiplo enquanto está carregando
- Reset adequado do flag ao desconectar
- Marca como carregado mesmo em caso de erro para evitar loop

**Arquivos Modificados:**
- `app/page.tsx`

---

## 🔍 Em Análise

(Nenhum bug pendente no momento)

