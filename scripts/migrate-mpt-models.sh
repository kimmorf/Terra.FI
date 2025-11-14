#!/bin/bash

# Script para gerar e aplicar migração do Prisma para modelos MPT
# Execute: bash scripts/migrate-mpt-models.sh

echo "🔧 Gerando Prisma Client..."
npx prisma generate

echo ""
echo "📦 Criando migração do banco de dados..."
echo "⚠️  Se solicitado, digite um nome para a migração (ex: add_mpt_models_and_wallet_updates)"
npx prisma migrate dev --name add_mpt_models_and_wallet_updates

echo ""
echo "✅ Migração concluída!"
echo ""
echo "📋 Próximos passos:"
echo "1. Verifique se a migração foi aplicada com sucesso"
echo "2. Teste as rotas API de MPT"
echo "3. Verifique as tabelas no banco: MPTIssuance, MPTAuthorization"

