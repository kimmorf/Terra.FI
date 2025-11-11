import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrismaClient(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[Prisma] DATABASE_URL não configurada. Operações que dependem do banco serão desativadas.',
      );
    }
    return null;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  return globalForPrisma.prisma;
}

// Export a non-nullable prisma instance for convenience
// Throws an error if DATABASE_URL is not configured
export const prisma = (() => {
  const client = getPrismaClient();
  if (!client) {
    throw new Error(
      'DATABASE_URL não configurada. Configure a variável de ambiente DATABASE_URL para usar o Prisma.',
    );
  }
  return client;
})();

