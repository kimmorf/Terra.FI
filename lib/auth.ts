import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getPrismaClient } from './prisma';

const prisma = getPrismaClient();

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
  secret: process.env.BETTER_AUTH_SECRET || 'change-me-in-production',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
});

