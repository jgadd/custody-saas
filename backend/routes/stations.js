const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticate, requireRole, requireActiveSubscription } = require('../middleware/auth');

const guard = [authenticate, requireActiveSubscription];

router.get('/me', authenticate, async (req, res) => {
  const station = await prisma.station.findUnique({
    where: { id: req.user.stationId },
    include: { plan: true, cells: true, _count: { select: { detainees: true, users: true } } }
  });
  res.json(station);
});

/**
 * PUT /api/stations/me/suburbs
 * Station admins manage their own suburb list — used to populate the
 * "Residential Address" dropdown on the booking form for this station.
 * Suburb naming isn't standardized nationally, so this is deliberately
 * filled in locally by staff who know the area rather than seeded
 * from a national list.
 */
router.put('/me/suburbs', ...guard, requireRole('STATION_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const { suburbs } = req.body;
  if (!Array.isArray(suburbs)) {
    return res.status(400).json({ error: 'suburbs must be an array of strings' });
  }
  const cleaned = suburbs.map(s => String(s).trim()).filter(Boolean);
  const station = await prisma.station.update({
    where: { id: req.user.stationId },
    data: { suburbs: cleaned }
  });
  res.json({ suburbs: station.suburbs });
});

router.get('/me/users', ...guard, requireRole('STATION_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { stationId: req.user.stationId },
    orderBy: { name: 'asc' }
  });
  res.json(users.map(({ passwordHash, ...u }) => u));
});

router.post('/me/users', ...guard, requireRole('STATION_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const { password, ...data } = req.body;
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { ...data, stationId: req.user.stationId, passwordHash: hash }
  });
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

router.get('/me/audit', ...guard, requireRole('STATION_ADMIN', 'DUTY_SERGEANT', 'SUPER_ADMIN'), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const logs = await prisma.auditLog.findMany({
    where: { stationId: req.user.stationId },
    include: { user: { select: { name: true, badgeNumber: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: parseInt(limit)
  });
  res.json(logs);
});

module.exports = router;
