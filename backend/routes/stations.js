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

router.get('/me/users', ...guard, requireRole('STATION_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { stationId: req.user.stationId },
    orderBy: { name: 'asc' }
  });
  res.json(users.map(({ passwordHash, ...u }) => u));
});

router.post('/me/users', ...guard, requireRole('STATION_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const { generateUsername } = require('../lib/generateUsername');
  const { password, ...data } = req.body;

  // Auto-generate username from full name: "Joshua Gadd" -> "jgadd"
  const username = await generateUsername(data.name);

  // Use provided temp password or a default — user must change on first login
  const tempPassword = password || 'ChangeMe123!';
  const hash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      ...data,
      username,
      stationId: req.user.stationId,
      passwordHash: hash,
      mustChangePassword: true,  // forces password change on first login
    }
  });
  const { passwordHash, ...safe } = user;
  // Return the generated username so admin can tell the new user
  res.json({ ...safe, generatedUsername: username });
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
