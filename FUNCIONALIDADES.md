# Funcionalidades Terra.FI

## Implementadas
- **Emissão de MPT (LAND / BUILD / REV / COL)** via Crossmark com metadados XLS-89.
- **Gestão avançada** (`/tokens/manage`): autorizar, enviar, congelar e clawback; visão de carteira XRPL e histórico.
- **Trading Desk** (`/tokens/trade`): trustline automática com stablecoins de teste, criação/validação de trustline dos MPTs, compra/venda manual e logs granulares (payment/authorize/trustset) no Elysia.
- **Distribuição de Receitas** (`/revenue`): cálculo de rateio REV-MPT, verificação de trustline do stablecoin antes do payout e pagamentos holder a holder com registro.
- **Logs Elysia**: emissões, pagamentos, freeze/clawback, trades, trustlines e payouts.
- **Endpoint de payouts** (`/api/payouts`): criação de batches de distribuição REV com persistência em Prisma.
- **Documentação rápida** (`INICIO_RAPIDO.md`) atualizada para os novos fluxos.
- **Aviso único** para carteiras sem MPT: mensagem no dashboard pode ser dispensada e não reaparece em loop.

## Em andamento / Próximas
- Automatizar pagamentos REV (batch com tracking de ciclos).
- Fluxo completo de crédito (penhor COL, liberação RLUSD, juros e liquidação automática).
- Integração XRPL DEX (ordens de compra/venda e book de ofertas).
- Alertas de governança e export CSV para compliance.

## Observações
- Cada nova feature deve encerrar com `npm run build` para garantir deploy limpo.
- Ajustar emissores/issuers conforme o ambiente (Testnet/Devnet/Mainnet).
