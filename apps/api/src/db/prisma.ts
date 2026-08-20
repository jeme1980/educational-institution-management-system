import { PrismaClient, type Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const runtimeDatabaseUrl = process.env['RLS_RUNTIME_DATABASE_URL'] || process.env['DATABASE_URL'];
const basePrisma = globalForPrisma.prisma ?? new PrismaClient(
  runtimeDatabaseUrl ? { datasources: { db: { url: runtimeDatabaseUrl } } } : undefined,
);

const requestTransactions = new AsyncLocalStorage<Prisma.TransactionClient>();

export function getRequestTransaction(): Prisma.TransactionClient | undefined {
  return requestTransactions.getStore();
}

export function runWithRequestTransaction<T>(tx: Prisma.TransactionClient, callback: () => Promise<T>): Promise<T> {
  return requestTransactions.run(tx, callback);
}

/**
 * Routes model operations to the request transaction when one exists. This
 * keeps the established `prisma.model.*` architecture while ensuring RLS
 * context and school queries use the same PostgreSQL transaction.
 */
export const prisma = new Proxy(basePrisma, {
  get(target, property, receiver) {
    const tx = requestTransactions.getStore();
    if (property === '$transaction') {
      return (arg: unknown, ...rest: unknown[]) => {
        if (!tx) return (target.$transaction as any)(arg, ...rest);
        if (typeof arg === 'function') return (arg as (client: Prisma.TransactionClient) => unknown)(tx);
        if (Array.isArray(arg)) return Promise.all(arg);
        return (target.$transaction as any)(arg, ...rest);
      };
    }
    if (tx && typeof property === 'string' && !property.startsWith('$')) {
      const txValue = (tx as any)[property];
      if (txValue !== undefined) return txValue;
    }
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as PrismaClient;

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = basePrisma;
}
