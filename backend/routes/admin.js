const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const adminOnly = [authenticate, requireRole('SUPER_ADMIN')];

// Dashboard stats
router.get('/stats', ...adminOnly, async (req, res) => {
  const [totalStations, activeStations, totalUsers, totalDetainees] = await Promise.all([
    prisma.station.count(),
    prisma.station.count({ where: { isActive: true, subscriptionStatus: 'ACTIVE' } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.detainee.count()
  ]);
  const revenue = await prisma.$queryRaw`
    SELECT COALESCE(SUM(p."monthlyPrice"), 0) as mrr
    FROM "Station" s JOIN "Plan" p ON s."planId" = p.id
    WHERE s."subscriptionStatus" = 'ACTIVE'`;
  res.json({ totalStations, activeStations, totalUsers, totalDetainees, mrr: revenue[0]?.mrr || 0 });
});

// Stations management
router.get('/stations', ...adminOnly, async (req, res) => {
  const stations = await prisma.station.findMany({
    include: { plan: true, _count: { select: { users: true, detainees: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(stations);
});

router.post('/stations', ...adminOnly, async (req, res) => {
  const { adminUser, ...stationData } = req.body;
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);
  const station = await prisma.station.create({
    data: { ...stationData, subscriptionStatus: 'TRIAL', trialEndsAt }
  });
  if (adminUser) {
    const hash = await bcrypt.hash(adminUser.password, 12);
    await prisma.user.create({
      data: {
        stationId: station.id,
        name: adminUser.name,
        email: adminUser.email.toLowerCase(),
        passwordHash: hash,
        role: 'STATION_ADMIN',
        badgeNumber: adminUser.badgeNumber
      }
    });
  }
  res.json(station);
});

router.put('/stations/:id', ...adminOnly, async (req, res) => {
  const station = await prisma.station.update({ where: { id: req.params.id }, data: req.body });
  res.json(station);
});

router.patch('/stations/:id/subscription', ...adminOnly, async (req, res) => {
  const { subscriptionStatus, planId, billedUntil } = req.body;
  const station = await prisma.station.update({
    where: { id: req.params.id },
    data: { subscriptionStatus, planId, billedUntil: billedUntil ? new Date(billedUntil) : undefined }
  });
  res.json(station);
});

// Users management
router.get('/users', ...adminOnly, async (req, res) => {
  const users = await prisma.user.findMany({
    include: { station: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(users.map(({ passwordHash, ...u }) => u));
});

router.post('/users', ...adminOnly, async (req, res) => {
  const { password, ...data } = req.body;
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { ...data, passwordHash: hash } });
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

module.exports = router;
