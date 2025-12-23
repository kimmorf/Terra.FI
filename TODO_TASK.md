# TODO: MPT Payment and Transfer Issues

## Status
Current implementation of MPT (Multi-Purpose Tokens) payments and transfers is encountering serialization and validation errors on XRPL Devnet/Testnet when using `ServiceWallet` (backend-signed).

## Known Issues
- **`tecNO_AUTH - Not authorized to hold asset`**: Este erro indica que a conta de destino **não está autorizada** a possuir o token MPT. MPTs exigem uma transação `MPTokenAuthorize` prévia. 

## Latest Progress
- **ID Resolution Fixed**: O sistema agora resolve corretamente o LedgerIndex (64 chars) para o `MPTokenIssuanceID` oficial (48 chars).
- **Auto-Autorização para Service Wallets**: Implementei uma lógica que autoriza automaticamente carteiras gerenciadas. (Nota: O destino `rMp2...` não é uma Service Wallet no seu banco atual, por isso não foi auto-autorizado).
- **Correção de `account_objects`**: Corrigi o erro `Invalid field 'type'` removendo o filtro problemático. O sistema agora verifica a autorização corretamente em todas as carteiras.
- **Logs Melhorados**: Os logs agora distinguem claramente entre a **Assinatura Local** (que funciona via `xrpl.js`) e a **Execução no Ledger** (que o servidor pode rejeitar por motivos de negócio como `tecNO_AUTH`).
- **Serialization Workaround**: O fallback está funcionando, permitindo usar IDs de 48 chars com o campo `mpt_issuance_id`.

## Current Blockers
- **Usuários Externos (Crossmark/Gem)**: Para carteiras que não controlamos a seed (ex: usuários finais), a autorização ainda deve ser feita manualmente pelo usuário no front-end.
- **`xrpl.js` Support**: A biblioteca nativa ainda falha na assinatura, mas o fallback via RPC resolve.

## Future Roadmap / Possible Fixes
- [ ] **Binary Serialization**: Implement manual binary serialization for MPT Payments (bypassing `xrpl.js` codec entirely).
- [ ] **Library Update**: Check for `xrpl.js` v5.0.0 or beta versions with better XLS-33 support.
- [ ] **Frontend Signing**: Shift focus to frontend-only signing for MPTs (Crossmark/Gem), assuming they might have updated their internal codecs.
- [ ] **Cross-Chain / Bridge**: Evaluate if MPT constraints are specific to certain networks or node versions.

## Technical Context
- **Network**: XRPL Devnet / Testnet.
- **Library**: `xrpl.js` v4.5.0.
- **Reference**: [XLS-33d Multi-Purpose Tokens](https://github.com/XRPLF/XRPL-Standards/discussions/107)

---
*Created on 2025-12-23 to track MPT implementation hurdles.*
