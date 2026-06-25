const router = require('express').Router();
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticate, requireRole, requireActiveSubscription } = require('../middleware/auth');

const adminOnly = [authenticate, requireRole('SUPER_ADMIN')];
// Any authenticated, active-subscription user can READ the geography
// tree — it's needed for booking form dropdowns at every station, not
// just by Super Admin. Only mutations (create/delete/import) are
// restricted to Super Admin below.
const anyUser = [authenticate, requireActiveSubscription];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/**
 * GET /api/admin/geography
 * Full Province -> District -> Suburb tree. Readable by any
 * authenticated user (booking forms need it); only Super Admin can
 * modify the underlying data via the routes below.
 */
router.get('/', ...anyUser, async (req, res) => {
  const provinces = await prisma.province.findMany({
    include: { districts: { include: { suburbs: true }, orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  res.json(provinces);
});

/**
 * GET /api/admin/geography/csv-template
 * Downloadable CSV template - three columns, example rows so the
 * format is obvious without needing real data yet.
 */
router.get('/csv-template', ...adminOnly, (req, res) => {
  const rows = [
    ['Province', 'District', 'Suburb'],
    ['National Capital District', 'Moresby South', 'Gordons'],
    ['National Capital District', 'Moresby South', 'Hohola'],
    ['Morobe', 'Lae', 'Eriku'],
  ];
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="png-geography-template.csv"');
  res.send(csv);
});

/**
 * GET /api/admin/geography/export
 * Export everything currently in the database as CSV, in the same
 * Province,District,Suburb shape as the import template - useful as
 * a backup before a bulk edit, or to hand to someone else to correct
 * and re-import.
 */
router.get('/export', ...adminOnly, async (req, res) => {
  const provinces = await prisma.province.findMany({
    include: { districts: { include: { suburbs: true } } },
  });
  const rows = [['Province', 'District', 'Suburb']];
  for (const p of provinces) {
    for (const d of p.districts) {
      if (d.suburbs.length === 0) {
        rows.push([p.name, d.name, '']);
      }
      for (const s of d.suburbs) {
        rows.push([p.name, d.name, s.name]);
      }
    }
  }
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="png-geography-export.csv"');
  res.send(csv);
});

/**
 * POST /api/admin/geography/import
 * Bulk import from a CSV file: Province,District,Suburb columns.
 * Suburb may be blank (just registering a district with no suburb
 * list yet). Existing provinces/districts/suburbs with matching names
 * are reused rather than duplicated - this is safe to re-run with a
 * corrected file.
 */
router.post('/import', ...adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

  let rows;
  try {
    rows = parseCsv(req.file.buffer.toString('utf-8'));
  } catch (e) {
    return res.status(400).json({ error: `Could not parse CSV: ${e.message}` });
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: 'CSV file is empty' });
  }

  // Tolerate a header row in any casing/order by checking the first row
  // for known column names; otherwise assume Province,District,Suburb
  // in that order with no header.
  let dataRows = rows;
  const firstRowLower = rows[0].map(c => c.trim().toLowerCase());
  if (firstRowLower.includes('province') && firstRowLower.includes('district')) {
    dataRows = rows.slice(1);
  }

  const results = { provincesCreated: 0, districtsCreated: 0, suburbsCreated: 0, rowsSkipped: 0, errors: [] };
  const provinceIdsSeenBefore = new Set((await prisma.province.findMany({ select: { id: true } })).map(p => p.id));

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const [provinceName, districtName, suburbName] = row.map(c => (c || '').trim());

    if (!provinceName || !districtName) {
      results.rowsSkipped++;
      results.errors.push(`Row ${i + 1}: missing Province or District, skipped`);
      continue;
    }

    try {
      let province = await prisma.province.findUnique({ where: { name: provinceName } });
      if (!province) {
        province = await prisma.province.create({ data: { name: provinceName } });
        results.provincesCreated++;
      }

      let district = await prisma.district.findUnique({
        where: { provinceId_name: { provinceId: province.id, name: districtName } },
      });
      if (!district) {
        district = await prisma.district.create({ data: { name: districtName, provinceId: province.id } });
        results.districtsCreated++;
      }

      if (suburbName) {
        const existingSuburb = await prisma.suburb.findUnique({
          where: { districtId_name: { districtId: district.id, name: suburbName } },
        });
        if (!existingSuburb) {
          await prisma.suburb.create({ data: { name: suburbName, districtId: district.id } });
          results.suburbsCreated++;
        }
      }
    } catch (e) {
      results.errors.push(`Row ${i + 1}: ${e.message}`);
    }
  }

  // Not using audit() here — AuditLog.stationId is required, but this
  // is a Super Admin / national-level action with no station context.
  // Logged to the server console instead; revisit if AuditLog gains
  // support for station-less entries.
  console.log(`Geography CSV import by ${req.user.email}:`, results);

  res.json(results);
});

// --- Manual CRUD (for one-off corrections without a full re-import) ---

router.post('/provinces', ...adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Province name is required' });
  try {
    const province = await prisma.province.create({ data: { name: name.trim() } });
    res.status(201).json(province);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Province already exists' });
    throw e;
  }
});

router.delete('/provinces/:id', ...adminOnly, async (req, res) => {
  await prisma.province.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.post('/districts', ...adminOnly, async (req, res) => {
  const { name, provinceId } = req.body;
  if (!name?.trim() || !provinceId) return res.status(400).json({ error: 'District name and provinceId are required' });
  try {
    const district = await prisma.district.create({ data: { name: name.trim(), provinceId } });
    res.status(201).json(district);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'District already exists in this province' });
    throw e;
  }
});

router.delete('/districts/:id', ...adminOnly, async (req, res) => {
  await prisma.district.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.post('/suburbs', ...adminOnly, async (req, res) => {
  const { name, districtId } = req.body;
  if (!name?.trim() || !districtId) return res.status(400).json({ error: 'Suburb name and districtId are required' });
  try {
    const suburb = await prisma.suburb.create({ data: { name: name.trim(), districtId } });
    res.status(201).json(suburb);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Suburb already exists in this district' });
    throw e;
  }
});

router.delete('/suburbs/:id', ...adminOnly, async (req, res) => {
  await prisma.suburb.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- Helpers ---

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Minimal CSV parser - handles quoted fields (with embedded commas and
 * escaped quotes) and both \n and \r\n line endings. No external
 * dependency, since this format is simple enough not to need one and
 * adding a new package risks the same "module not found at build
 * time" failures hit earlier with other dependencies this session.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const chars = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (inQuotes) {
      if (c === '"') {
        if (chars[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(c => c.trim() !== ''));
}

module.exports = router;
