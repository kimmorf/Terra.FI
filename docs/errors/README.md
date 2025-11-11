# 🐛 Sistema de Monitoramento de Erros

Este diretório contém todos os erros identificados durante testes e validações do Terra.FI.

## 📋 Estrutura

```
docs/errors/
├── README.md                    # Este arquivo
├── ERROR_TRANSFER.md           # Falhas no envio MPT
├── ERROR_LOGIN.md              # Erros Crossmark, token inválido, sessão expirada
├── ERROR_MPT_LOCK.md          # Falha no freeze/issue do colateral
├── ERROR_UI_STATE.md           # Front inconsistente, travado, input incorreto
├── ERROR_DEX.md                # Problemas com DEX/OfferCreate
├── ERROR_AUTH.md               # Problemas de autorização MPT
├── ERROR_PAYMENT.md            # Falhas em pagamentos XRP/RLUSD
├── ERROR_QUOTE.md              # Problemas com quotes expirados/inválidos
└── .template.md                # Template para novos erros
```

## 🎯 Protocolo de Reporte

### Nomenclatura

Arquivos de erro seguem o padrão: `ERROR_<CATEGORIA>.md`

**Categorias:**
- `TRANSFER` - Falhas no envio/recebimento de MPT
- `LOGIN` - Erros de autenticação Crossmark/Better Auth
- `MPT_LOCK` - Problemas com freeze/unfreeze e colateralização
- `UI_STATE` - Inconsistências de interface, estados travados
- `DEX` - Problemas com DEX, OfferCreate, trading
- `AUTH` - Problemas de autorização MPT (Authorize/Deauthorize)
- `PAYMENT` - Falhas em pagamentos XRP/RLUSD
- `QUOTE` - Problemas com quotes, expiração, validação

### Classificação por Criticidade

#### 🚨 Critical
- Bloqueia operação principal (mint, buy, lock)
- Perda de fundos ou tokens
- Falha de segurança
- Corrupção de dados

#### ⚠️ Medium
- Falha intermitente, pode ser retry manual
- Degradação de performance
- Erro em operação secundária
- Problema de UX que impede fluxo

#### 🧩 Low
- Erro de UX, log, naming
- Mensagem de erro confusa
- Melhoria de interface
- Documentação

## 📝 Template de Erro

Cada arquivo de erro deve seguir este template:

```markdown
# ERROR_<CATEGORIA>

## 📋 Resumo
Breve descrição do erro

## 🎯 Criticidade
🚨 Critical | ⚠️ Medium | 🧩 Low

## 🔍 Detalhes
- **Quando ocorre:** [descrição]
- **Frequência:** [sempre/intermitente/raro]
- **Impacto:** [descrição do impacto]

## 📊 Evidências
- **TX Hash:** [se aplicável]
- **Timestamp:** [data/hora]
- **Network:** [testnet/mainnet]
- **Payload:** [JSON do payload]

## 🔄 Passos para Reproduzir
1. [passo 1]
2. [passo 2]
3. [passo 3]

## ✅ Status
- [ ] Identificado
- [ ] Em análise
- [ ] Em correção
- [ ] Resolvido
- [ ] Testado

**Status atual:** [status]
**Data resolução:** [data]
**Commit:** [hash do commit]
**PR:** [#número]

## 🛠️ Solução
[Descrição da solução implementada]

## 📚 Referências
- Issue: #[número]
- Teste relacionado: [nome do teste]
```

## 🔄 Workflow

1. **Identificação**: Erro detectado durante teste/validação
2. **Classificação**: Determinar categoria e criticidade
3. **Documentação**: Criar/atualizar arquivo ERROR_<CATEGORIA>.md
4. **Issue**: Abrir issue no board (se Critical ou Medium)
5. **Correção**: Desenvolvedor corrige e abre PR
6. **Validação**: Testador valida correção
7. **Atualização**: Marcar como resolvido no arquivo

## 📊 Estatísticas

Execute `npm run errors:stats` para ver estatísticas de erros.

## 🔗 Links Úteis

- [Board de Issues](../../.github/ISSUES.md)
- [Guia de Testes](../../scripts/tests/README.md)
- [Documentação XRPL](https://xrpl.org/docs/)
