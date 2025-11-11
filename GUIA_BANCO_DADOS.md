# Guia de Conexão com Banco de Dados e Deploy Online

Este guia explica como conectar seu projeto Terra.FI ao banco de dados PostgreSQL e executá-lo online.

## 📋 Índice

1. [Configuração Local do Banco de Dados](#configuração-local)
2. [Configuração de Banco de Dados Online](#banco-de-dados-online)
3. [Executando o Projeto Online](#executando-online)
4. [Troubleshooting](#troubleshooting)

---

## 🏠 Configuração Local do Banco de Dados

### Opção 1: PostgreSQL Local

#### Passo 1: Instalar PostgreSQL

**Windows:**
- Baixe o instalador em: https://www.postgresql.org/download/windows/
- Ou use o instalador gráfico do PostgreSQL
- Durante a instalação, anote a senha do usuário `postgres`

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

#### Passo 2: Criar o Banco de Dados

Abra o terminal e execute:

```bash
# Conectar ao PostgreSQL
psql -U postgres

# Criar banco de dados
CREATE DATABASE terra_fi;

# Criar usuário (opcional)
CREATE USER terra_user WITH PASSWORD 'sua_senha_aqui';
GRANT ALL PRIVILEGES ON DATABASE terra_fi TO terra_user;

# Sair
\q
```

#### Passo 3: Configurar Variáveis de Ambiente

1. Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```

2. Edite o arquivo `.env` e configure a `DATABASE_URL`:
```env
DATABASE_URL="postgresql://postgres:sua_senha@localhost:5432/terra_fi"
```

**Formato da URL:**
```
postgresql://usuario:senha@host:porta/nome_do_banco
```

#### Passo 4: Gerar o Cliente Prisma e Executar Migrações

```bash
# Gerar o cliente Prisma
npx prisma generate

# Executar migrações (cria as tabelas)
npx prisma migrate dev --name init

# (Opcional) Abrir Prisma Studio para visualizar o banco
npx prisma studio
```

---

## ☁️ Banco de Dados Online

### Opção 1: Neon (Recomendado - Grátis)

**Neon** oferece PostgreSQL serverless com plano gratuito generoso.

1. **Criar conta:**
   - Acesse: https://neon.tech
   - Crie uma conta gratuita

2. **Criar projeto:**
   - Clique em "Create Project"
   - Escolha um nome (ex: `terra-fi`)
   - Selecione a região mais próxima
   - Clique em "Create Project"

3. **Obter a string de conexão:**
   - No dashboard do Neon, vá em "Connection Details"
   - Copie a "Connection string" (formato: `postgresql://...`)
   - A URL já inclui SSL, então está pronta para uso

4. **Configurar no projeto:**
   ```env
   DATABASE_URL="postgresql://usuario:senha@ep-xxx.region.neon.tech/terra_fi?sslmode=require"
   ```

5. **Executar migrações:**
   ```bash
   npx prisma migrate deploy
   ```

### Opção 2: Supabase (Grátis)

1. **Criar conta:**
   - Acesse: https://supabase.com
   - Crie uma conta gratuita

2. **Criar projeto:**
   - Clique em "New Project"
   - Preencha os dados e aguarde a criação

3. **Obter a string de conexão:**
   - Vá em "Settings" > "Database"
   - Copie a "Connection string" (URI)
   - Use a senha do banco que você definiu

4. **Configurar:**
   ```env
   DATABASE_URL="postgresql://postgres:[SUA-SENHA]@db.xxx.supabase.co:5432/postgres"
   ```

### Opção 3: Railway (Grátis com créditos)

1. **Criar conta:**
   - Acesse: https://railway.app
   - Conecte com GitHub

2. **Criar banco PostgreSQL:**
   - Clique em "New Project"
   - Adicione "PostgreSQL"
   - Railway criará automaticamente

3. **Obter variáveis:**
   - Clique no banco de dados
   - Vá em "Variables"
   - Copie a `DATABASE_URL`

### Opção 4: Render (Grátis)

1. **Criar conta:**
   - Acesse: https://render.com
   - Crie uma conta

2. **Criar banco:**
   - Clique em "New" > "PostgreSQL"
   - Configure e crie

3. **Obter URL:**
   - No dashboard, copie a "Internal Database URL" ou "External Database URL"

---

## 🚀 Executando o Projeto Online

### Opção 1: Vercel (Recomendado para Next.js)

**Vercel** é a melhor opção para projetos Next.js.

#### Passo 1: Preparar o Projeto

1. **Garantir que o build funciona:**
   ```bash
   npm run build
   ```

2. **Adicionar script de build no package.json** (já existe):
   ```json
   "build": "next build"
   ```

#### Passo 2: Deploy na Vercel

1. **Instalar Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Fazer login:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```
   - Siga as instruções no terminal
   - Quando perguntar sobre variáveis de ambiente, adicione:
     - `DATABASE_URL`
     - `BETTER_AUTH_SECRET`
     - `BETTER_AUTH_URL` (URL do seu deploy)
     - `NEXT_PUBLIC_APP_URL` (URL do seu deploy)

4. **Ou usar o dashboard:**
   - Acesse: https://vercel.com
   - Conecte seu repositório GitHub
   - Configure as variáveis de ambiente no dashboard
   - Deploy automático a cada push!

#### Passo 3: Executar Migrações na Vercel

A Vercel executa automaticamente o build, mas você precisa executar as migrações manualmente:

```bash
# Usando a DATABASE_URL do seu banco online
npx prisma migrate deploy
```

Ou adicione um script no `package.json`:

```json
"postbuild": "prisma migrate deploy"
```

### Opção 2: Railway (Full Stack)

**Railway** permite deploy do Next.js e do servidor Elysia juntos.

1. **Conectar repositório:**
   - Acesse: https://railway.app
   - Conecte seu GitHub
   - Selecione o repositório

2. **Configurar variáveis:**
   - Adicione todas as variáveis de ambiente no dashboard

3. **Deploy automático:**
   - Railway detecta Next.js e faz deploy automaticamente

### Opção 3: Render

1. **Criar serviço:**
   - Acesse: https://render.com
   - Clique em "New" > "Web Service"
   - Conecte seu repositório

2. **Configurar:**
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - Adicione as variáveis de ambiente

---

## 🔧 Configuração Completa para Produção

### Arquivo `.env` para Produção

```env
# Banco de Dados Online
DATABASE_URL="postgresql://usuario:senha@host:5432/database?sslmode=require"

# Better Auth (GERE UMA CHAVE SEGURA!)
BETTER_AUTH_SECRET="gere-uma-chave-segura-com-openssl-rand-base64-32"
BETTER_AUTH_URL="https://seu-dominio.vercel.app"

# Elysia Server (se usar)
ELYSIA_PORT=3001

# Next.js
NEXT_PUBLIC_APP_URL="https://seu-dominio.vercel.app"

# GitHub OAuth (opcional)
GITHUB_CLIENT_ID="seu-client-id"
GITHUB_CLIENT_SECRET="seu-client-secret"
```

### Gerar BETTER_AUTH_SECRET Seguro

```bash
# Linux/macOS
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

---

## 🐛 Troubleshooting

### Erro: "Can't reach database server"

**Solução:**
- Verifique se a `DATABASE_URL` está correta
- Para bancos online, certifique-se de incluir `?sslmode=require`
- Verifique se o firewall permite conexões

### Erro: "Migration failed"

**Solução:**
```bash
# Resetar migrações (CUIDADO: apaga dados!)
npx prisma migrate reset

# Ou criar nova migração
npx prisma migrate dev --name nome_da_migracao
```

### Erro: "Prisma Client not generated"

**Solução:**
```bash
npx prisma generate
```

### Verificar Conexão com o Banco

```bash
# Testar conexão
npx prisma db pull

# Abrir Prisma Studio
npx prisma studio
```

### Variáveis de Ambiente não Carregadas

- Certifique-se de que o arquivo `.env` está na raiz do projeto
- Reinicie o servidor após alterar `.env`
- Na produção, configure as variáveis no painel da plataforma

---

## 📚 Recursos Úteis

- [Documentação Prisma](https://www.prisma.io/docs)
- [Documentação Next.js](https://nextjs.org/docs)
- [Documentação Vercel](https://vercel.com/docs)
- [Neon Documentation](https://neon.tech/docs)
- [Supabase Documentation](https://supabase.com/docs)

---

## ✅ Checklist de Deploy

- [ ] Banco de dados criado e configurado
- [ ] `DATABASE_URL` configurada corretamente
- [ ] Migrações executadas (`npx prisma migrate deploy`)
- [ ] `BETTER_AUTH_SECRET` gerado e configurado
- [ ] Variáveis de ambiente configuradas na plataforma
- [ ] Build local funciona (`npm run build`)
- [ ] Testes locais passando
- [ ] Deploy realizado
- [ ] Aplicação acessível online

---

**Dúvidas?** Consulte a documentação oficial ou abra uma issue no repositório.

