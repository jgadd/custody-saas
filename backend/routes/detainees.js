const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { generateCustodyNumber } = require('../lib/custodyNumber');
const { generateOffenderNumber } = require('../lib/offenderNumber');
const { audit } = require('../lib/audit');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const guard = [authenticate, requireActiveSubscription];

// Shared with routes/biometrics.js — both write into the same uploads
// volume so officers can view face/fingerprint scans from either path.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function saveBiometricFile(buffer, ext) {
  const filename = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

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
      include: {
        cell: true,
        createdBy: { select: { name: true, badgeNumber: true } },
        offender: {
          include: {
            biometrics: { where: { type: 'FACE' }, orderBy: { capturedAt: 'desc' }, take: 1 }
          }
        }
      },
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
          biometrics: { orderBy: { capturedAt: 'desc' } },
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
  const {
    offenderId, matchMethod, matchConfidence,
    newOffender, pendingFingerprint,
    ...bookingFields
  } = req.body;

  if (!offenderId && !newOffender) {
    return res.status(400).json({ error: 'offenderId or newOffender is required. Run biometric capture or select an offender before booking.' });
  }

  try {
    const custodyNumber = await generateCustodyNumber(req.user.stationId);

    // Everything below — offender creation, face biometric, fingerprint
    // biometric, and the booking itself — happens in one transaction.
    // If booking creation fails for any reason, the offender and any
    // biometric data created alongside it are rolled back too, so a
    // face or fingerprint scan never lingers in the database without
    // a completed booking attached to it.
    const detainee = await prisma.$transaction(async (tx) => {
      let resolvedOffenderId = offenderId;

      if (!resolvedOffenderId && newOffender) {
        const offenderNumber = await generateOffenderNumber();
        const offender = await tx.offender.create({
          data: {
            offenderNumber,
            firstName: newOffender.firstName,
            lastName: newOffender.lastName,
            alias: newOffender.alias || null,
            dateOfBirth: newOffender.dateOfBirth ? new Date(newOffender.dateOfBirth) : null,
            gender: newOffender.gender,
            nationality: newOffender.nationality || 'Papua New Guinean',
            ethnicity: newOffender.ethnicity || null,
            originProvince: newOffender.originProvince || null,
            originVillage: newOffender.originVillage || null,
          },
        });
        resolvedOffenderId = offender.id;

        if (newOffender.descriptor && newOffender.photoBuffer) {
          const url = saveBiometricFile(Buffer.from(newOffender.photoBuffer, 'base64'), 'jpg');
          await tx.biometric.create({
            data: {
              offenderId: resolvedOffenderId,
              type: 'FACE',
              faceEmbedding: newOffender.descriptor,
              facePhotoUrl: url,
              capturedById: req.user.id,
              capturedAtStationId: req.user.stationId,
            },
          });
        }
      } else {
        const existing = await tx.offender.findUnique({ where: { id: resolvedOffenderId } });
        if (!existing) {
          throw Object.assign(new Error('Offender not found. It may not have synced yet — try again once online.'), { status: 404 });
        }
      }

      if (pendingFingerprint?.buffer && pendingFingerprint?.fingerPosition) {
        const ext = pendingFingerprint.mimetype?.split('/')[1] || 'png';
        const url = saveBiometricFile(Buffer.from(pendingFingerprint.buffer, 'base64'), ext);
        await tx.biometric.create({
          data: {
            offenderId: resolvedOffenderId,
            type: 'FINGERPRINT',
            fingerPosition: pendingFingerprint.fingerPosition,
            fingerprintUrl: url,
            capturedById: req.user.id,
            capturedAtStationId: req.user.stationId,
          },
        });
      }

      return tx.detainee.create({
        data: {
          ...bookingFields,
          // bookingFields arrives from the frontend with date inputs as
          // plain strings (e.g. "2026-01-15") — Prisma's DateTime fields
          // require a real Date object or null, and reject raw strings
          // with a PrismaClientValidationError before ever touching the
          // database. Convert both date fields explicitly here.
          dateOfBirth: bookingFields.dateOfBirth ? new Date(bookingFields.dateOfBirth) : null,
          courtDate: bookingFields.courtDate ? new Date(bookingFields.courtDate) : null,
          offenderId: resolvedOffenderId,
          matchMethod: matchMethod || 'MANUAL',
          matchConfidence: matchConfidence ?? null,
          stationId: req.user.stationId,
          createdById: req.user.id,
          custodyNumber,
          syncedAt: new Date()
        },
        include: { cell: true, createdBy: { select: { name: true, badgeNumber: true } }, offender: true }
      });
    });

    await audit(req.user.stationId, req.user.id, 'CREATE', 'Detainee', detainee.id, { custodyNumber, matchMethod }, req.ip);
    res.status(201).json(detainee);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Booking creation failed:', err);
    res.status(500).json({ error: 'Failed to create booking. No offender or biometric data was saved.' });
  }
});

router.put('/:id', ...guard, async (req, res) => {
  const existing = await prisma.detainee.findFirst({
    where: { id: req.params.id, stationId: req.user.stationId }
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { dateOfBirth, courtDate, ...rest } = req.body;
  const detainee = await prisma.detainee.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
      ...(courtDate !== undefined && { courtDate: courtDate ? new Date(courtDate) : null }),
      syncedAt: new Date()
    },
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
