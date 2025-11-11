# Bugs Identificados

## 1. Trading Desk – endereço de destino incorreto na venda
- **Local**: `app/tokens/trade/page.tsx`, função `handleSell`.
- **Problema**: quando o emissor não informa manualmente `issuerAddress`, o código usa `selectedStable.issuer` como fallback (`destination: issuerAddress || selectedStable.issuer`). Isso envia o MPT para o emissor do stablecoin (ex.: RLUSD) e não para o emissor do MPT, resultando em `tecNO_DST_INSUF_XRP` ou perda do ativo.
- **Como reproduzir**:
  1. Deixar o campo “Endereço do emissor” vazio.
  2. Tentar vender um MPT.
  3. A transação será enviada para o emissor do stablecoin e falhará.
- **Impacto**: alto – liquidações de posição ficam impossíveis até o usuário notar e preencher manualmente o endereço correto.
- **Sugestão**: usar `issuerAddress || account.address` ou bloquear a ação até que `issuerAddress` válido seja informado.

## 2. Trading Desk – logs de trustline com tipo errado
- **Local**: `app/tokens/trade/page.tsx`, função `handleCreateTrustline`, e `server/index.ts`.
- **Problema**: o registro de ações envia `type: 'authorize'` com `metadata: { action: 'trustset' }`, mas o backend não reconhece um tipo específico de “trustset”. A ação fica misturada com autorizações reais, dificultando auditoria.
- **Como reproduzir**:
  1. Criar uma trustline pelo Trading Desk.
  2. Conferir `/api/actions`: a linha aparece como `authorize` em vez de `trustset`.
- **Impacto**: médio – logs imprecisos inviabilizam o rastreamento de quem abriu trustlines.
- **Sugestão**: incluir `t.Literal('trustset')` no servidor e enviar `type: 'trustset'` no frontend.

## 3. Revenue – ausência de verificação de trustline para o stablecoin
- **Local**: `app/revenue/page.tsx`, função `handlePayHolder`.
- **Problema**: pagamentos REV usam stablecoins (`selectedStable`). Se o holder não tiver trustline com o stablecoin, a transação falha (`tecNO_LINE`) e o erro só aparece depois da tentativa.
- **Como reproduzir**:
  1. Tente pagar um holder sem trustline para o stablecoin escolhido.
  2. A Crossmark exibirá erro e o fluxo travará.
- **Impacto**: médio-alto – aumenta o retrabalho na distribuição e impede automação.
- **Sugestão**: checar `hasTrustLine` antes de chamar `sendMPToken`, oferecer opção de disparar trustline ou marcar o holder como “pendente”.


