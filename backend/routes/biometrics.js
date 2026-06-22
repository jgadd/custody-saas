const router = require('express').Router();
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { extractDescriptor, findBestMatch } = require('../services/faceMatch');
const { audit } = require('../lib/audit');

const guard = [authenticate, requireActiveSubscription];

// In-memory upload only — /face/search never writes the photo to disk
// itself. It's a read-only lookup; if the officer proceeds to book,
// the photo (as base64) travels with the booking request and is only
// written to disk inside the same transaction that creates the
// booking — see routes/detainees.js.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * POST /api/biometrics/face/search
 * Upload a face photo. Runs face matching against every offender
 * (across ALL stations — this is intentionally not scoped to the
 * current station, since the whole point is catching repeat offenders
 * who were booked elsewhere).
 *
 * Returns either:
 *   { match: { offender, confidence, priorBookings } }
 *   { match: null }  — no match found above the confidence threshold
 */
router.post('/face/search', ...guard, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const descriptor = await extractDescriptor(req.file.buffer);
  if (!descriptor) {
    return res.status(422).json({ error: 'No face detected in the photo. Please retake and ensure good lighting.' });
  }

  const allFaceBiometrics = await prisma.biometric.findMany({
    where: { type: 'FACE' },
    select: { offenderId: true, faceEmbedding: true },
  });

  const result = findBestMatch(descriptor, allFaceBiometrics);

  if (!result) {
    // Stash the descriptor temporarily so the client doesn't need to
    // re-upload the photo if they proceed to create a new offender.
    return res.json({ match: null, descriptor, photoBuffer: req.file.buffer.toString('base64') });
  }

  const offender = await prisma.offender.findUnique({
    where: { id: result.offenderId },
    include: {
      bookings: {
        orderBy: { bookingTime: 'desc' },
        include: { station: { select: { name: true, code: true } } },
      },
    },
  });

  await audit(req.user.stationId, req.user.id, 'FACE_MATCH_LOOKUP', 'Offender', offender.id, {
    confidence: result.confidence,
  });

  res.json({
    match: {
      offender,
      confidence: Math.round(result.confidence * 100) / 100,
      priorBookingsCount: offender.bookings.length,
      priorStations: [...new Set(offender.bookings.map(b => b.station.name))],
    },
    descriptor,
    photoBuffer: req.file.buffer.toString('base64'),
  });
});

/**
 * GET /api/biometrics/offenders/:id
 * Full offender profile with booking history across all stations.
 */
router.get('/offenders/:id', ...guard, async (req, res) => {
  const offender = await prisma.offender.findUnique({
    where: { id: req.params.id },
    include: {
      biometrics: { orderBy: { capturedAt: 'desc' } },
      bookings: {
        orderBy: { bookingTime: 'desc' },
        include: { station: { select: { name: true, code: true } }, cell: true },
      },
    },
  });
  if (!offender) return res.status(404).json({ error: 'Offender not found' });
  res.json(offender);
});

/**
 * GET /api/biometrics/stats
 * Dashboard widget data: lookup activity for this station.
 */
router.get('/stats', ...guard, async (req, res) => {
  const stationId = req.user.stationId;

  const [totalOffenders, totalFaceBiometrics, recentMatches] = await Promise.all([
    prisma.offender.count(),
    prisma.biometric.count({ where: { type: 'FACE' } }),
    prisma.detainee.count({
      where: { stationId, matchMethod: 'FACE_MATCH' },
    }),
  ]);

  res.json({ totalOffenders, totalFaceBiometrics, recentMatchesAtStation: recentMatches });
});

module.exports = router;
