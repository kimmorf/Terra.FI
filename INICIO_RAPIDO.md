# 🚀 Início Rápido - Terra.FI

## Configuração Rápida do Banco de Dados

### 1. Criar arquivo `.env`

Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo:

```env
# Banco de Dados
DATABASE_URL="postgresql://usuario:senha@localhost:5432/terra_fi"

# Better Auth (gere uma chave segura!)
BETTER_AUTH_SECRET="sua-chave-secreta-aqui"
BETTER_AUTH_URL="http://localhost:3000"

# Elysia Server
ELYSIA_PORT=3001

# Next.js
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 2. Opções de Banco de Dados

#### Opção A: Banco Local (PostgreSQL)

1. Instale o PostgreSQL
2. Crie o banco: `CREATE DATABASE terra_fi;`
3. Configure a `DATABASE_URL` no `.env`

#### Opção B: Banco Online (Recomendado para produção)

**Neon (Grátis):**
1. Acesse: https://neon.tech
2. Crie um projeto
3. Copie a connection string
4. Cole no `.env` como `DATABASE_URL`

**Supabase (Grátis):**
1. Acesse: https://supabase.com
2. Crie um projeto
3. Vá em Settings > Database
4. Copie a connection string

### 3. Configurar o Banco

```bash
# Gerar cliente Prisma
npx prisma generate

# Executar migrações (cria as tabelas)
npx prisma migrate dev --name init
```

### 4. Executar o Projeto

```bash
# Terminal 1 - Next.js
npm run dev

# Terminal 2 - Elysia (opcional)
npm run server
```

Acesse: http://localhost:3000

---

## 🔐 Emissão de Tokens MPT

1. Conecte a carteira Crossmark no dashboard principal (`/`).
2. Acesse `http://localhost:3000/tokens/create` para abrir a Terra.FI Token Factory.
3. Escolha entre LAND, BUILD, REV ou COL, ajuste metadados e finalize a emissão.
4. Após assinar a transação, acompanhe o hash no explorer XRPL (testnet/devnet).

> Os presets seguem o blueprint descrito em [`Terra_fi.md`](./Terra_fi.md) e usam metadados compatíveis com XLS-89.

---

## 🌐 Deploy Online

### Vercel (Recomendado)

1. Instale a Vercel CLI: `npm i -g vercel`
2. Execute: `vercel`
3. Configure as variáveis de ambiente no dashboard
4. Execute as migrações: `npx prisma migrate deploy`

### Railway

1. Acesse: https://railway.app
2. Conecte seu repositório GitHub
3. Configure as variáveis de ambiente
4. Deploy automático!

---

📖 **Para mais detalhes, consulte o [GUIA_BANCO_DADOS.md](./GUIA_BANCO_DADOS.md)**

