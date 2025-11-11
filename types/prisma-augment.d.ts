import type { Prisma } from '@prisma/client';

declare module '@prisma/client' {
    interface PrismaClient<
        T extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
        U = 'log' extends keyof T ? Prisma.GetEvents<T['log']> : never,
        GlobalRejectSettings extends
        | Prisma.RejectOnNotFound
        | Prisma.RejectPerOperation
        | undefined = undefined
    > {
        get revPayoutBatch(): Prisma.RevPayoutBatchDelegate<GlobalRejectSettings>;
        get revPayoutItem(): Prisma.RevPayoutItemDelegate<GlobalRejectSettings>;
    }
}

