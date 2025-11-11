# Testes E2E e QA - Terra.FI

Sistema completo de testes end-to-end, performance e negativos para garantir confiabilidade das operações XRPL.

## 📋 Estrutura

```
tests/
├── setup/
│   └── xrpl-test-env.ts      # Ambiente de testes XRPL (faucet, contas)
├── e2e/
│   ├── land-flow.test.ts     # Teste: issue → authorize → buy
│   ├── col-flow.test.ts      # Teste: freeze → issue COL → unlock
│   └── negative-tests.test.ts # Testes de ataques/abusos
├── performance/
│   └── stress.test.ts        # Stress tests e métricas de performance
└── reports/
    └── test-reporter.ts      # Gerador de relatórios
```

## 🚀 Setup

### Pré-requisitos

```bash
npm install -D vitest @vitest/ui
```

### Variáveis de Ambiente

```env
DATABASE_URL="postgresql://..."
BETTER_AUTH_SECRET="..."
NEXT_PUBLIC_ELYSIA_URL="http://localhost:3001"
```

## 🧪 Executar Testes

### Todos os testes

```bash
npm run test
```

### Testes E2E específicos

```bash
npm run test:e2e
```

### Testes de performance

```bash
npm run test:performance
```

### Testes negativos

```bash
npm run test:negative
```

### Com UI

```bash
npm run test:ui
```

## 📊 Relatórios

Os relatórios são gerados automaticamente em `test-reports/` após cada execução.

### Formato do Relatório

- ✅ Resumo de testes (pass/fail/skip)
- 📝 Passo-a-passo de cada teste
- 🔗 Links para transações na XRPL Explorer
- 📈 Métricas de performance
- 🐛 Lista priorizada de bugs

## 🎯 Cobertura de Testes

### Fluxos Funcionais

- ✅ **LAND Flow**: Issue → Authorize → Buy
- ✅ **COL Flow**: Freeze LAND → Issue COL → Unlock
- ✅ **BUILD Flow**: Escrow create → Finish/Cancel
- ✅ **REV Flow**: Snapshot → Distribute (múltiplos holders)

### Testes Negativos

- ✅ Duplicação de submissão (idempotência)
- ✅ Transfer sem autorização
- ✅ Transfer COL (deve falhar)
- ✅ Out-of-sequence transactions
- ✅ LastLedgerSequence expiration

### Performance

- ✅ Burst de transações (50+)
- ✅ Latência de validação
- ✅ Throughput sob carga
- ✅ P95/P99 latencies

## 📈 Métricas Coletadas

- `e2e_pass_rate`: Taxa de sucesso dos testes E2E
- `p95_tx_validation_time`: Percentil 95 do tempo de validação
- `p99_tx_validation_time`: Percentil 99 do tempo de validação
- `error_budget`: Budget de erros por release
- `throughput`: Transações por segundo
- `retry_count`: Número médio de retries

## 🐛 Priorização de Bugs

Os bugs são automaticamente priorizados no relatório:

- 🔴 **CRITICAL**: Falhas em operações atômicas, perda de dados
- 🟠 **HIGH**: Falhas de autorização, freeze/unfreeze
- 🟡 **MEDIUM**: Falhas de funcionalidade geral

## ✅ Definition of Done

- ✅ Todos os fluxos críticos com ≥ 95% de sucesso sob carga moderada
- ✅ Lista de bugs priorizados com reprodução passo-a-passo
- ✅ TX hashes para todas as operações
- ✅ Métricas de performance documentadas

## 🔄 Integração com CI/CD

```yaml
# .github/workflows/test.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: test-reports/
```

## 📚 Recursos

- [XRPL Testnet Faucet](https://xrpl.org/xrp-testnet-faucet.html)
- [XRPL Testnet Explorer](https://testnet.xrpl.org)
- [Vitest Documentation](https://vitest.dev)
