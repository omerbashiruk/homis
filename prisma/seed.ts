/**
 * Seed a demo mosque with the default fund taxonomy and a couple of operators.
 * Run with `npm run db:seed` (needs a live Postgres + a completed migration).
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_FUNDS } from '../src/funds/taxonomy';

const prisma = new PrismaClient();

async function main() {
  const mosque = await prisma.mosque.upsert({
    where: { id: 'seed-mosque-al-noor' },
    update: {},
    create: {
      id: 'seed-mosque-al-noor',
      name: 'Masjid Al-Noor',
      bankAccount: 'GB00 RAMA 0000 0000 0000 00',
      subscriptionStatus: 'active',
    },
  });

  await prisma.operator.createMany({
    data: [
      { mosqueId: mosque.id, name: 'Yusuf Khan', role: 'operator' },
      { mosqueId: mosque.id, name: 'Aisha Rahman', role: 'admin' },
    ],
    skipDuplicates: true,
  });

  for (const fund of DEFAULT_FUNDS) {
    await prisma.fund.upsert({
      where: { mosqueId_name: { mosqueId: mosque.id, name: fund.name } },
      update: { type: fund.type, restricted: fund.restricted, passThrough: fund.passThrough },
      create: {
        mosqueId: mosque.id,
        name: fund.name,
        type: fund.type,
        restricted: fund.restricted,
        passThrough: fund.passThrough,
        notes: fund.notes,
      },
    });
  }

  console.log(`Seeded mosque "${mosque.name}" with ${DEFAULT_FUNDS.length} funds.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
