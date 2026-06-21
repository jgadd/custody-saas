const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { generateCustodyNumber } = require('../lib/custodyNumber');
const { audit } = require('../lib/audit');

const guard = [authenticate, requireActiveSubscription];

router.get('/', ...guard, async (req, res) => {
  const { status, search, page = 1, limit = 50, from, to } = req.query;
  const where = { stationId: req.user.stationId };
  if (status) where.status = status;
  if (from || to) {
    where.bookingTime = {};
    if (from) where.bookingTime.gte = new Date(from);
    if (to) where.bookingTime.lte = new Date(to);
  }
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { custodyNumber: { contains: search, mode: 'insensitive' } },
      { alias: { contains: search, mode: 'insensitive' } }
    ];
  }
  const [detainees, total] = await Promise.all([
    prisma.detainee.findMany({
      where,
      include: { cell: true, createdBy: { select: { name: true, badgeNumber: true } } },
      orderBy: { bookingTime: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    }),
    prisma.detainee.count({ where })
  ]);
  res.json({ detainees, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

router.get('/stats', ...guard, async (req, res) => {
  const stationId = req.user.stationId;
  const today = new Date(); today.setHours(0,0,0,0);
  const [inCustody, todayBookings, total, byStatus] = await Promise.all([
    prisma.detainee.count({ where: { stationId, status: 'IN_CUSTODY' } }),
    prisma.detainee.count({ where: { stationId, bookingTime: { gte: today } } }),
    prisma.detainee.count({ where: { stationId } }),
    prisma.detainee.groupBy({ by: ['status'], where: { stationId }, _count: true })
  ]);
  res.json({ inCustody, todayBookings, total, byStatus });
});

router.get('/:id', ...guard, async (req, res) => {
  const detainee = await prisma.detainee.findFirst({
    where: { id: req.params.id, stationId: req.user.stationId },
    include: {
      cell: true,
      createdBy: { select: { name: true, badgeNumber: true, rank: true } },
      releasedBy: { select: { name: true, badgeNumber: true } },
      reviews: { orderBy: { reviewedAt: 'desc' } },
      offender: {
        include: {
          biometrics: { where: { type: 'FACE' }, orderBy: { capturedAt: 'desc' }, take: 1 },
          bookings: {
            where: { id: { not: req.params.id } },
            orderBy: { bookingTime: 'desc' },
            include: { station: { select: { name: true, code: true } } },
          },
        },
      },
    }
  });
  if (!detainee) return res.status(404).json({ error: 'Not found' });
  res.json(detainee);
});

router.post('/', ...guard, async (req, res) => {
  const { offenderId, matchMethod, matchConfidence, ...bookingFields } = req.body;

  if (!offenderId) {
    return res.status(400).json({ error: 'offenderId is required. Run biometric capture or select an offender before booking.' });
  }
  const offender = await prisma.offender.findUnique({ where: { id: offenderId } });
  if (!offender) {
    return res.status(404).json({ error: 'Offender not found. It may not have synced yet — try again once online.' });
  }

  const custodyNumber = await generateCustodyNumber(req.user.stationId);
  const detainee = await prisma.detainee.create({
    data: {
      ...bookingFields,
      offenderId,
      matchMethod: matchMethod || 'MANUAL',
      matchConfidence: matchConfidence ?? null,
      stationId: req.user.stationId,
      createdById: req.user.id,
      custodyNumber,
      syncedAt: new Date()
    },
    include: { cell: true, createdBy: { select: { name: true, badgeNumber: true } }, offender: true }
  });
  await audit(req.user.stationId, req.user.id, 'CREATE', 'Detainee', detainee.id, { custodyNumber, matchMethod }, req.ip);
  res.status(201).json(detainee);
});

router.put('/:id', ...guard, async (req, res) => {
  const existing = await prisma.detainee.findFirst({
    where: { id: req.params.id, stationId: req.user.stationId }
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const detainee = await prisma.detainee.update({
    where: { id: req.params.id },
    data: { ...req.body, syncedAt: new Date() },
    include: { cell: true, createdBy: { select: { name: true, badgeNumber: true } } }
  });
  await audit(req.user.stationId, req.user.id, 'UPDATE', 'Detainee', detainee.id, req.body, req.ip);
  res.json(detainee);
});

router.post('/:id/release', ...guard, async (req, res) => {
  const { releaseReason } = req.body;
  const detainee = await prisma.detainee.update({
    where: { id: req.params.id },
    data: {
      status: 'RELEASED',
      releaseTime: new Date(),
      releaseReason,
      releasedById: req.user.id,
      cellId: null
    }
  });
  await audit(req.user.stationId, req.user.id, 'RELEASE', 'Detainee', detainee.id, { releaseReason }, req.ip);
  res.json(detainee);
});

router.post('/:id/reviews', ...guard, async (req, res) => {
  const review = await prisma.custodyReview.create({
    data: {
      detaineeId: req.params.id,
      reviewedBy: req.user.name,
      ...req.body
    }
  });
  res.json(review);
});

module.exports = router;
