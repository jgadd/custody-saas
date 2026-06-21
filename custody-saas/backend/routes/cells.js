const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireActiveSubscription, requireRole } = require('../middleware/auth');

const guard = [authenticate, requireActiveSubscription];

router.get('/', ...guard, async (req, res) => {
  const cells = await prisma.cell.findMany({
    where: { stationId: req.user.stationId, isActive: true },
    include: { _count: { select: { detainees: { where: { status: 'IN_CUSTODY' } } } } }
  });
  res.json(cells);
});

router.post('/', ...guard, requireRole('STATION_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const cell = await prisma.cell.create({
    data: { ...req.body, stationId: req.user.stationId }
  });
  res.json(cell);
});

router.put('/:id', ...guard, requireRole('STATION_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  const cell = await prisma.cell.update({ where: { id: req.params.id }, data: req.body });
  res.json(cell);
});

module.exports = router;
