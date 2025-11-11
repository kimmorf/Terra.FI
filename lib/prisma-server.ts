import { PrismaClient } from '@prisma/client';

// Prisma client para uso no servidor Elysia (Bun)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrismaServerClient(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[Prisma Server] DATABASE_URL não configurada. Operações que dependem do banco serão desativadas.',
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
