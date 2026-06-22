const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { generateCustodyNumber } = require('../lib/custodyNumber');
const { generateOffenderNumber } = require('../lib/offenderNumber');
const { audit } = require('../lib/audit');

// Offline sync endpoint - accepts batch of records created offline
router.post('/push', authenticate, requireActiveSubscription, async (req, res) => {
  const { records } = req.body; // array of { type, clientId, data, updatedAt }
  const results = [];

  for (const record of records) {
    try {
      if (record.type === 'detainee') {
        // Check if already synced by clientId
        const existing = await prisma.detainee.findFirst({
          where: { clientId: record.clientId }
        });
        if (existing) {
          // Update if local is newer
          if (new Date(record.updatedAt) > existing.updatedAt) {
            const updated = await prisma.detainee.update({
              where: { id: existing.id },
              data: { ...record.data, syncedAt: new Date() }
            });
            results.push({ clientId: record.clientId, serverId: updated.id, action: 'updated' });
          } else {
            results.push({ clientId: record.clientId, serverId: existing.id, action: 'skipped' });
          }
        } else {
          // Offline bookings never run biometric capture (it needs a live
          // server round-trip for face matching), so they always arrive
          // here without an offenderId. We create a placeholder Offender
          // from the entered name/DOB so the booking can still be filed —
          // a station admin can merge it into an existing Offender later
          // once back online if a face match would have found one.
          //
          // Offender creation and booking creation happen in one
          // transaction, same as the live booking path — if the
          // booking fails, the placeholder offender is rolled back
          // too, rather than left orphaned with no booking attached.
          const custodyNumber = await generateCustodyNumber(req.user.stationId);
          const created = await prisma.$transaction(async (tx) => {
            let offenderId = record.data.offenderId;
            if (!offenderId) {
              const offenderNumber = await generateOffenderNumber();
              const offender = await tx.offender.create({
                data: {
                  offenderNumber,
                  firstName: record.data.firstName,
                  lastName: record.data.lastName,
                  alias: record.data.alias || null,
                  dateOfBirth: record.data.dateOfBirth ? new Date(record.data.dateOfBirth) : null,
                  gender: record.data.gender,
                  nationality: record.data.nationality || 'Papua New Guinean',
                  ethnicity: record.data.ethnicity || null,
                },
              });
              offenderId = offender.id;
            }

            return tx.detainee.create({
              data: {
                ...record.data,
                offenderId,
                matchMethod: record.data.matchMethod || 'MANUAL',
                stationId: req.user.stationId,
                createdById: req.user.id,
                custodyNumber,
                clientId: record.clientId,
                syncedAt: new Date()
              }
            });
          });
          await audit(req.user.stationId, req.user.id, 'SYNC_CREATE', 'Detainee', created.id, { clientId: record.clientId }, req.ip);
          results.push({ clientId: record.clientId, serverId: created.id, action: 'created', custodyNumber });
        }
      }
    } catch (e) {
      results.push({ clientId: record.clientId, action: 'error', error: e.message });
    }
  }

  res.json({ results });
});

// Pull updates since last sync
router.get('/pull', authenticate, requireActiveSubscription, async (req, res) => {
  const { since } = req.query;
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const detainees = await prisma.detainee.findMany({
    where: { stationId: req.user.stationId, updatedAt: { gte: sinceDate } },
    include: { cell: true }
  });
  const cells = await prisma.cell.findMany({
    where: { stationId: req.user.stationId, isActive: true }
  });
  res.json({ detainees, cells, serverTime: new Date() });
});

module.exports = router;
