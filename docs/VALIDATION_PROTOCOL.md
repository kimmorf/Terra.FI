# 📋 Protocolo de Validação e Monitoramento de Erros

## 🎯 Objetivo

Validar todas as features implementadas e criar um protocolo único de reporte com arquivos de erro nomeados no padrão `ERROR_<CATEGORIA>.md`.

## 🚀 Como Executar

### Pipeline Completo

```bash
# Executa build + validação + monitoramento
npm run validate:pipeline -- --network=testnet
```

### Validação Individual

```bash
# Validar todas as features
npm run validate:all -- --network=testnet

# Monitorar erros
npm run errors:stats      # Estatísticas
npm run errors:check     # Verificar novos erros
```

## 📁 Estrutura de Erros

Todos os erros são documentados em `docs/errors/`:

```
docs/errors/
├── README.md              # Documentação do sistema
├── .template.md           # Template para novos erros
├── ERROR_TRANSFER.md      # Falhas no envio MPT
├── ERROR_LOGIN.md         # Erros Crossmark, token inválido
├── ERROR_MPT_LOCK.md      # Falha no freeze/issue do colateral
├── ERROR_UI_STATE.md      # Front inconsistente, travado
├── ERROR_DEX.md           # Problemas com DEX/OfferCreate
├── ERROR_AUTH.md          # Problemas de autorização MPT
├── ERROR_PAYMENT.md       # Falhas em pagamentos
└── ERROR_QUOTE.md         # Problemas com quotes
```

## 🔄 Workflow

1. **Validação**: Executar `npm run validate:pipeline`
2. **Identificação**: Scripts identificam erros automaticamente
3. **Classificação**: Erros são classificados por categoria e criticidade
4. **Documentação**: Arquivos `ERROR_<CATEGORIA>.md` são criados/atualizados
5. **Issue**: Criar issue no board (se Critical ou Medium)
6. **Correção**: Desenvolvedor corrige e abre PR
7. **Validação**: Testador valida correção
8. **Atualização**: Marcar como resolvido no arquivo

## 📊 Criticidade

### 🚨 Critical
- Bloqueia operação principal (mint, buy, lock)
- Perda de fundos ou tokens
- Falha de segurança
- Corrupção de dados
- **Ação**: Criar issue imediatamente

### ⚠️ Medium
- Falha intermitente, pode ser retry manual
- Degradação de performance
- Erro em operação secundária
- Problema de UX que impede fluxo
- **Ação**: Criar issue, prioridade média

### 🧩 Low
- Erro de UX, log, naming
- Mensagem de erro confusa
- Melhoria de interface
- Documentação
- **Ação**: Documentar, sem issue urgente

## 🧪 Features Validadas

O script `validate-all-features.ts` valida:

1. ✅ **Compra Primária**: Payment + MPT send
2. ✅ **DEX/OfferCreate**: Criação de ofertas
3. ✅ **Colateralização**: Freeze/Unfreeze
4. ✅ **Autorização**: Authorize/Deauthorize
5. ✅ **Login/Auth**: Validação de contas
6. ✅ **Operações XRPL**: Consultas básicas

## 📝 Template de Erro

Cada erro segue o template em `.template.md`:

- Resumo
- Criticidade
- Detalhes (quando, frequência, impacto)
- Evidências (TX hash, payload, logs)
- Passos para reproduzir
- Status (Identificado → Resolvido)
- Solução
- Referências

## 🔍 Monitoramento

### Verificar Estatísticas

```bash
npm run errors:stats
```

Exibe:
- Total de erros
- Por criticidade (Critical/Medium/Low)
- Por status (Identificado/Resolvido/etc)
- Por categoria

### Verificar Novos Erros

```bash
npm run errors:check
```

Lista erros não resolvidos, agrupados por criticidade.

## 🛠️ Resolução de Erros

### Processo

1. **Identificar**: Erro detectado durante validação
2. **Documentar**: Arquivo `ERROR_<CATEGORIA>.md` criado
3. **Classificar**: Determinar criticidade
4. **Issue**: Abrir issue no board (se necessário)
5. **Corrigir**: Desenvolvedor implementa correção
6. **PR**: Abrir PR com referência ao erro (`fix: ERROR_TRANSFER #52`)
7. **Validar**: Testador valida correção
8. **Atualizar**: Marcar como resolvido no arquivo

### Atualizar Status

No arquivo de erro, atualizar:

```markdown
## ✅ Status
- [x] Identificado
- [x] Em análise
- [x] Em correção
- [x] Resolvido
- [x] Testado

**Status atual:** Resolvido
**Data resolução:** 2025-01-27
**Commit:** abc123def456
**PR:** #52
```

## 📚 Referências

- [README de Erros](./errors/README.md)
- [Scripts de Teste](../scripts/tests/README.md)
- [Documentação XRPL](https://xrpl.org/docs/)

## 🎯 Critérios de Sucesso

- ✅ Todas as features validadas
- ✅ Erros documentados em `ERROR_<CATEGORIA>.md`
- ✅ Issues criadas para Critical/Medium
- ✅ Status atualizado após resolução
- ✅ Pipeline executa sem erros críticos
