# 🧪 Scripts de Teste Terra.FI

Este diretório contém scripts de teste E2E e stress tests para a plataforma Terra.FI.

## 📋 Estrutura

```
scripts/tests/
├── setup-accounts.ts      # Setup de contas de teste (faucet)
├── e2e-land-flow.ts       # E2E: Emissão → Authorize → Compra → Freeze → COL → Unlock
├── e2e-build-escrow.ts    # E2E: BUILD Escrow (Finish/Cancel)
├── stress-offercreate.ts  # Stress test: OfferCreate com análise p95
├── config/                # Configurações de contas (gerado automaticamente)
└── reports/               # Relatórios de testes (gerado automaticamente)
```

## 🚀 Quick Start

### 1. Setup de Contas

Primeiro, crie as contas de teste e solicite fundos do faucet:

```bash
# Testnet
tsx scripts/tests/setup-accounts.ts --network=testnet

# Devnet
tsx scripts/tests/setup-accounts.ts --network=devnet
```

Isso criará:
- `issuer_hot`: Conta que emite tokens MPT
- `admin`: Conta administrativa
- `investor1`, `investor2`, `investor3`: Contas de investidores

**Arquivos gerados:**
- `config/accounts-{network}.json` - Configuração completa (inclui secrets)
- `config/.env.{network}.example` - Exemplo de variáveis de ambiente (sem secrets)

⚠️ **IMPORTANTE:** O arquivo `accounts-{network}.json` contém secrets. Não commite no git!

### 2. E2E Test: Fluxo LAND-MPT

Testa o fluxo completo de tokenização:

```bash
tsx scripts/tests/e2e-land-flow.ts --network=testnet
```

**Fluxo testado:**
1. ✅ Emissão de LAND-MPT
2. ✅ Authorize para investidores
3. ✅ Compra de tokens pelos investidores
4. ✅ Freeze de tokens
5. ✅ Emissão de COL-MPT (colateral)
6. ✅ Unlock (unfreeze) de tokens

### 3. E2E Test: BUILD Escrow

Testa o fluxo de escrow para BUILD-MPT:

```bash
tsx scripts/tests/e2e-build-escrow.ts --network=testnet
```

**Fluxo testado:**
1. ✅ Emissão de BUILD-MPT
2. ✅ Authorize para investor
3. ✅ Criação de Escrow condicional
4. ✅ Finish Escrow (conclusão)
5. ✅ Cancel Escrow (cancelamento)

### 4. Stress Test: OfferCreate

Testa performance de criação de ofertas:

```bash
# Padrão: 100 ofertas, concorrência 10
tsx scripts/tests/stress-offercreate.ts --network=testnet

# Customizado
tsx scripts/tests/stress-offercreate.ts --network=testnet --count=500 --concurrency=20
```

**Métricas coletadas:**
- Taxa de sucesso
- Latências (min, max, avg, p50, p95, p99)
- Throughput (ofertas/segundo)
- Análise de erros

## 📊 Relatórios

Todos os testes geram relatórios JSON em `reports/`:

- `e2e-land-flow-{network}-{timestamp}.json`
- `e2e-build-escrow-{network}-{timestamp}.json`
- `e2e-web3-auth-{network}-{timestamp}.json`
- `e2e-primary-purchase-{network}-{timestamp}.json`
- `stress-offercreate-{network}-{timestamp}.json`

### Estrutura do Relatório

```json
{
  "network": "testnet",
  "startTime": "2025-01-27T...",
  "endTime": "2025-01-27T...",
  "duration": 12345,
  "results": [...],
  "summary": {
    "total": 6,
    "passed": 6,
    "failed": 0
  }
}
```

## 🔧 Configuração

### Variáveis de Ambiente

Crie um arquivo `.env.test` (opcional):

```env
XRPL_NETWORK=testnet
XRPL_ENDPOINT=wss://s.altnet.rippletest.net:51233
```

### Networks Suportadas

- `testnet` - Ripple Testnet (padrão)
- `devnet` - Ripple Devnet

## 📝 Exemplos de Uso

### Executar todos os testes em sequência

```bash
# 1. Setup
tsx scripts/tests/setup-accounts.ts --network=testnet

# 2. E2E LAND
tsx scripts/tests/e2e-land-flow.ts --network=testnet

# 3. E2E BUILD Escrow
tsx scripts/tests/e2e-build-escrow.ts --network=testnet

# 4. Stress Test
tsx scripts/tests/stress-offercreate.ts --network=testnet --count=200
```

### Verificar contas criadas

```bash
cat scripts/tests/config/accounts-testnet.json | jq '.issuer_hot.address'
cat scripts/tests/config/accounts-testnet.json | jq '.investors[0].address'
```

## 🐛 Troubleshooting

### Erro: "Configuração não encontrada"

Execute primeiro o setup de contas:
```bash
tsx scripts/tests/setup-accounts.ts --network=testnet
```

### Erro: "Faucet retornou erro"

O faucet pode ter rate limiting. Tente:
1. Aguardar alguns minutos
2. Solicitar manualmente em: https://faucet.altnet.rippletest.net/
3. Usar devnet: `--network=devnet`

### Erro: "Transação falhou: tecKILLED"

Isso geralmente significa:
- Saldo insuficiente
- Sequência incorreta
- Token não autorizado

Verifique os saldos das contas e se os tokens foram criados corretamente.

### Timeout em stress test

Reduza a concorrência:
```bash
tsx scripts/tests/stress-offercreate.ts --network=testnet --concurrency=5
```

## 📚 Referências

- [XRPL Documentation](https://xrpl.org/docs/)
- [XRPL Testnet Faucet](https://xrpl.org/docs/references/xrpl-testnet-faucet/)
- [MPToken Documentation](https://xrpl.org/docs/references/protocol/transactions/types/mptokenissuancecreate)

## 🔒 Segurança

⚠️ **NUNCA commite:**
- `config/accounts-*.json` (contém secrets)
- Arquivos com `.secret` ou `.key`

✅ **Adicione ao `.gitignore`:**
```
scripts/tests/config/accounts-*.json
scripts/tests/config/.env.*
```

## 📈 Próximos Passos

- [ ] Adicionar testes de integração com Crossmark SDK
- [ ] Testes de carga para múltiplos tokens
- [ ] Testes de edge cases (valores limites, erros)
- [ ] CI/CD integration
- [ ] Relatórios HTML visuais
