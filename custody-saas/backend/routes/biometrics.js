const router = require('express').Router();
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { generateOffenderNumber } = require('../lib/offenderNumber');
const { extractDescriptor, findBestMatch } = require('../services/faceMatch');
const { audit } = require('../lib/audit');

const guard = [authenticate, requireActiveSubscription];

// In-memory upload (photos are small, max 5MB) — persisted to disk below
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Photos are written to a shared volume so every backend replica (and any
// future station-facing service) can read them. Served back via the
// /uploads static route mounted in server.js.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function saveUpload(buffer, ext) {
  const filename = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

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
 * POST /api/biometrics/fingerprint/upload
 * Phase 1: stores the fingerprint image only. No automated matching —
 * that requires AFIS integration, tracked as a Phase 2/3 item. The
 * image is still attached to the offender record for an officer to
 * visually compare if needed.
 */
router.post('/fingerprint/upload', ...guard, upload.single('scan'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No fingerprint scan uploaded' });
  const { offenderId, fingerPosition } = req.body;
  if (!offenderId || !fingerPosition) {
    return res.status(400).json({ error: 'offenderId and fingerPosition are required' });
  }

  const ext = req.file.mimetype.split('/')[1] || 'png';
  const url = saveUpload(req.file.buffer, ext);

  const biometric = await prisma.biometric.create({
    data: {
      offenderId,
      type: 'FINGERPRINT',
      fingerPosition,
      fingerprintUrl: url,
      capturedById: req.user.id,
      capturedAtStationId: req.user.stationId,
    },
  });

  res.status(201).json(biometric);
});

/**
 * POST /api/biometrics/offenders
 * Create a new Offender identity (used when face search found no match).
 * Persists the face descriptor that was already extracted during search
 * so the photo doesn't need to be re-uploaded or re-processed.
 */
router.post('/offenders', ...guard, async (req, res) => {
  const { firstName, lastName, alias, dateOfBirth, gender, nationality, ethnicity, descriptor, photoBuffer } = req.body;

  if (!firstName || !lastName || !gender) {
    return res.status(400).json({ error: 'firstName, lastName, and gender are required' });
  }

  const offenderNumber = await generateOffenderNumber();

  const offender = await prisma.offender.create({
    data: {
      offenderNumber,
      firstName,
      lastName,
      alias,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender,
      nationality: nationality || 'Papua New Guinean',
      ethnicity,
    },
  });

  if (descriptor && photoBuffer) {
    const url = saveUpload(Buffer.from(photoBuffer, 'base64'), 'jpg');
    await prisma.biometric.create({
      data: {
        offenderId: offender.id,
        type: 'FACE',
        faceEmbedding: descriptor,
        facePhotoUrl: url,
        capturedById: req.user.id,
        capturedAtStationId: req.user.stationId,
      },
    });
  }

  await audit(req.user.stationId, req.user.id, 'OFFENDER_CREATED', 'Offender', offender.id, { offenderNumber });

  res.status(201).json(offender);
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
