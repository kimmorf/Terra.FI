import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getPrismaClient } from './prisma';

const prisma = getPrismaClient();

// Validação obrigatória do secret em produção
if (process.env.NODE_ENV === 'production' && !process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    'BETTER_AUTH_SECRET é obrigatório em produção. Configure a variável de ambiente.'
  );
}

if (!process.env.BETTER_AUTH_SECRET) {
  console.warn(
    '⚠️  BETTER_AUTH_SECRET não configurado. Usando valor temporário apenas para desenvolvimento.'
  );
}

export const auth = betterAuth({
  database: prisma
    ? prismaAdapter(prisma, {
        provider: 'postgresql',
      })
    : ((): never => {
        throw new Error('DATABASE_URL não configurada. better-auth requer acesso ao banco.');
      })(),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-secret-change-in-production' : ((): never => {
    throw new Error('BETTER_AUTH_SECRET é obrigatório em produção.');
  })()),
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
});

