const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Plans
  const basic = await prisma.plan.upsert({
    where: { id: 'plan-basic' },
    create: { id: 'plan-basic', name: 'Basic', maxUsers: 5, maxDetainees: 500, monthlyPrice: 99, features: ['custody_register', 'reports'] },
    update: {}
  });
  const standard = await prisma.plan.upsert({
    where: { id: 'plan-standard' },
    create: { id: 'plan-standard', name: 'Standard', maxUsers: 15, maxDetainees: 2000, monthlyPrice: 249, features: ['custody_register', 'reports', 'audit_log', 'cell_management', 'welfare_checks'] },
    update: {}
  });
  const premium = await prisma.plan.upsert({
    where: { id: 'plan-premium' },
    create: { id: 'plan-premium', name: 'Premium', maxUsers: 50, maxDetainees: 10000, monthlyPrice: 499, features: ['custody_register', 'reports', 'audit_log', 'cell_management', 'welfare_checks', 'api_access', 'multi_station', 'analytics'] },
    update: {}
  });

  // Demo station
  const station = await prisma.station.upsert({
    where: { code: 'BKO' },
    create: {
      code: 'BKO', name: 'Boroko Police Station', province: 'NCD',
      district: 'Moresby North-East', address: 'Boroko, NCD',
      planId: standard.id, subscriptionStatus: 'ACTIVE',
      billingStartDate: new Date(), billedUntil: new Date(Date.now() + 365*24*60*60*1000)
    },
    update: {}
  });

  // Demo cells
  const cellData = [
    { cellNumber: 'C1', type: 'GENERAL', capacity: 6 },
    { cellNumber: 'C2', type: 'GENERAL', capacity: 6 },
    { cellNumber: 'F1', type: 'FEMALE', capacity: 4 },
    { cellNumber: 'J1', type: 'JUVENILE', capacity: 4 },
  ];
  for (const c of cellData) {
    await prisma.cell.upsert({
      where: { stationId_cellNumber: { stationId: station.id, cellNumber: c.cellNumber } },
      create: { ...c, stationId: station.id },
      update: {}
    });
  }

  // Super admin
  const superHash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { email: 'superadmin@custody.gov.pg' },
    create: { email: 'superadmin@custody.gov.pg', name: 'Super Admin', passwordHash: superHash, role: 'SUPER_ADMIN' },
    update: {}
  });

  // Station admin
  const adminHash = await bcrypt.hash('boroko123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@boroko.police.gov.pg' },
    create: {
      email: 'admin@boroko.police.gov.pg', name: 'Sgt. Peter Kila',
      badgeNumber: 'BKO-001', rank: 'Sergeant',
      passwordHash: adminHash, role: 'STATION_ADMIN', stationId: station.id
    },
    update: {}
  });

  // Demo officer
  const offHash = await bcrypt.hash('officer123', 12);
  await prisma.user.upsert({
    where: { email: 'officer@boroko.police.gov.pg' },
    create: {
      email: 'officer@boroko.police.gov.pg', name: 'Const. Mary Tua',
      badgeNumber: 'BKO-042', rank: 'Constable',
      passwordHash: offHash, role: 'OFFICER', stationId: station.id
    },
    update: {}
  });

  console.log('Seed complete!');
  console.log('Super Admin: superadmin@custody.gov.pg / admin123');
  console.log('Station Admin: admin@boroko.police.gov.pg / boroko123');
  console.log('Officer: officer@boroko.police.gov.pg / officer123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
