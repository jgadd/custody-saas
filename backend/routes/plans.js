const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { monthlyPrice: 'asc' } });
  res.json(plans);
});

router.post('/', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  const plan = await prisma.plan.create({ data: req.body });
  res.json(plan);
});

router.put('/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  const plan = await prisma.plan.update({ where: { id: req.params.id }, data: req.body });
  res.json(plan);
});

module.exports = router;
