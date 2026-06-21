/**
 * Prisma client singleton. Guards against creating a new connection pool on
 * every hot reload in development.
 *
 * Requires `prisma generate` to have run (wired via the `postinstall` script).
 * The mock backend does NOT import this — Step 0 runs entirely in-memory, so the
 * contract and demo work with no database present.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
