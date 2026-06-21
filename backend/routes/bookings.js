const router = require('express').Router();
const db = require('../db');
const { authenticate, requireRole, requireStation } = require('../middleware/auth');

router.use(authenticate, requireStation);

// GET /api/bookings - list bookings for station
router.get('/', async (req, res) => {
  const { status, search, limit = 50, offset = 0 } = req.query;
  const stationId = req.stationId;
  if (!stationId) return res.status(400).json({ error: 'station_id required' });

  let q = `
    SELECT b.id, b.booking_number, b.status, b.booked_in_at, b.released_at,
           b.charge_description, b.charge_severity, b.risk_level, b.court_date,
           b.cell_id, c.cell_number,
           d.first_name || ' ' || d.last_name AS detainee_name,
           d.gender, d.dob, d.id AS detainee_id,
           b.arrested_by_name, b.local_id, b.updated_at
    FROM bookings b
    JOIN detainees d ON b.detainee_id = d.id
    LEFT JOIN cells c ON b.cell_id = c.id
    WHERE b.station_id = $1`;
  const params = [stationId];
  let i = 2;

  if (status) { q += ` AND b.status = $${i++}`; params.push(status); }
  if (search) { q += ` AND (d.first_name || ' ' || d.last_name) ILIKE $${i++}`; params.push(`%${search}%`); }

  q += ` ORDER BY b.booked_in_at DESC LIMIT $${i++} OFFSET $${i++}`;
  params.push(parseInt(limit), parseInt(offset));

  const { rows } = await db.query(q, params);
  res.json(rows);
});

// GET /api/bookings/stats
router.get('/stats', async (req, res) => {
  const stationId = req.stationId;
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='in_custody') AS in_custody,
       COUNT(*) FILTER (WHERE status='released') AS released,
       COUNT(*) FILTER (WHERE status='court') AS at_court,
       COUNT(*) FILTER (WHERE booked_in_at::date = CURRENT_DATE) AS today,
       COUNT(*) AS total
     FROM bookings WHERE station_id = $1`,
    [stationId]
  );
  // Cell occupancy
  const { rows: cells } = await db.query(
    `SELECT c.cell_number, c.capacity, c.cell_type,
            COUNT(b.id) FILTER (WHERE b.status='in_custody') AS occupied
     FROM cells c
     LEFT JOIN bookings b ON b.cell_id = c.id
     WHERE c.station_id = $1 AND c.is_active = true
     GROUP BY c.id ORDER BY c.cell_number`,
    [stationId]
  );
  res.json({ ...rows[0], cells });
});

// GET /api/bookings/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, 
            d.first_name, d.last_name, d.alias, d.dob, d.gender, d.nationality,
            d.id_type, d.id_number, d.address AS detainee_address, d.phone AS detainee_phone,
            d.next_of_kin_name, d.next_of_kin_phone, d.next_of_kin_relationship,
            d.height_cm, d.weight_kg, d.distinguishing_marks, d.photo_url,
            c.cell_number,
            u.full_name AS booked_in_by_name
     FROM bookings b
     JOIN detainees d ON b.detainee_id = d.id
     LEFT JOIN cells c ON b.cell_id = c.id
     LEFT JOIN users u ON b.booked_in_by_id = u.id
     WHERE b.id = $1 AND b.station_id = $2`,
    [req.params.id, req.stationId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Booking not found' });

  // Fetch related data
  const [logR, welfareR, propR] = await Promise.all([
    db.query(`SELECT * FROM custody_log WHERE booking_id=$1 ORDER BY event_at DESC`, [req.params.id]),
    db.query(`SELECT * FROM welfare_checks WHERE booking_id=$1 ORDER BY checked_at DESC`, [req.params.id]),
    db.query(`SELECT * FROM property_items WHERE booking_id=$1 ORDER BY received_at`, [req.params.id]),
  ]);

  res.json({ ...rows[0], custody_log: logR.rows, welfare_checks: welfareR.rows, property_items: propR.rows });
});

// POST /api/bookings - create new booking
router.post('/', async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const stationId = req.stationId;
    const { 
      // Detainee
      first_name, last_name, alias, dob, gender, nationality, id_type, id_number,
      address, phone, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
      height_cm, weight_kg, distinguishing_marks,
      // Booking
      cell_id, arrest_date, arrest_location, arresting_unit,
      charge_description, charge_severity, section_of_law, alleged_offence_date,
      court_date, court_name, medical_conditions, medications,
      risk_level, special_instructions,
      // Sync
      local_id, existing_detainee_id,
    } = req.body;

    // Get station code for booking number
    const { rows: sRows } = await client.query('SELECT code FROM stations WHERE id=$1', [stationId]);
    const stationCode = sRows[0]?.code || 'UNK';

    // Check plan limits
    const { rows: planR } = await client.query(
      `SELECT sp.max_monthly_bookings, COUNT(b.id) AS monthly_count
       FROM stations s JOIN subscription_plans sp ON s.plan_id = sp.id
       LEFT JOIN bookings b ON b.station_id = s.id AND date_trunc('month', b.created_at) = date_trunc('month', NOW())
       WHERE s.id = $1 GROUP BY sp.max_monthly_bookings`,
      [stationId]
    );
    if (planR[0]?.max_monthly_bookings && parseInt(planR[0].monthly_count) >= parseInt(planR[0].max_monthly_bookings)) {
      throw Object.assign(new Error('Monthly booking limit reached for your plan'), { status: 402 });
    }

    // Create or reuse detainee
    let detaineeId = existing_detainee_id;
    if (!detaineeId) {
      const detR = await client.query(
        `INSERT INTO detainees (station_id, first_name, last_name, alias, dob, gender, nationality, id_type, id_number, address, phone, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, height_cm, weight_kg, distinguishing_marks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [stationId, first_name, last_name, alias, dob || null, gender, nationality || 'Papua New Guinean', id_type, id_number, address, phone, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, height_cm || null, weight_kg || null, distinguishing_marks]
      );
      detaineeId = detR.rows[0].id;
    }

    // Generate booking number
    const { rows: seqR } = await client.query('SELECT next_booking_number($1,$2) AS num', [stationId, stationCode]);
    const bookingNumber = seqR[0].num;

    const bookRes = await client.query(
      `INSERT INTO bookings (booking_number, station_id, detainee_id, cell_id, arrested_by_id, arrested_by_name,
         arrest_date, arrest_location, arresting_unit, charge_description, charge_severity, section_of_law,
         alleged_offence_date, court_date, court_name, medical_conditions, medications,
         risk_level, special_instructions, booked_in_by_id, local_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [bookingNumber, stationId, detaineeId, cell_id || null, req.user.id, req.user.full_name,
       arrest_date || new Date(), arrest_location, arresting_unit,
       charge_description, charge_severity || 'summary', section_of_law,
       alleged_offence_date || null, court_date || null, court_name,
       medical_conditions, medications, risk_level || 'low', special_instructions, req.user.id, local_id || null]
    );
    const booking = bookRes.rows[0];

    // Log it
    await client.query(
      `INSERT INTO custody_log (booking_id, station_id, event_type, event_description, performed_by_id, performed_by_name)
       VALUES ($1,$2,'booked_in',$3,$4,$5)`,
      [booking.id, stationId, `Detainee booked in. Charges: ${charge_description}`, req.user.id, req.user.full_name]
    );

    await client.query('COMMIT');
    res.status(201).json(booking);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking' });
  } finally {
    client.release();
  }
});

// PATCH /api/bookings/:id/release
router.patch('/:id/release', requireRole('station_admin', 'senior_officer', 'officer'), async (req, res) => {
  const { release_reason, bail_amount } = req.body;
  const { rows } = await db.query(
    `UPDATE bookings SET status='released', released_at=NOW(), released_by_id=$1, release_reason=$2, bail_amount=$3
     WHERE id=$4 AND station_id=$5 AND status='in_custody' RETURNING *`,
    [req.user.id, release_reason, bail_amount || null, req.params.id, req.stationId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Booking not found or already released' });

  await db.query(
    `INSERT INTO custody_log (booking_id, station_id, event_type, event_description, performed_by_id, performed_by_name)
     VALUES ($1,$2,'released',$3,$4,$5)`,
    [req.params.id, req.stationId, `Released: ${release_reason}`, req.user.id, req.user.full_name]
  );
  res.json(rows[0]);
});

// PATCH /api/bookings/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status, notes } = req.body;
  const valid = ['in_custody', 'released', 'transferred', 'court', 'hospital', 'escaped'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const { rows } = await db.query(
    `UPDATE bookings SET status=$1 WHERE id=$2 AND station_id=$3 RETURNING *`,
    [status, req.params.id, req.stationId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  await db.query(
    `INSERT INTO custody_log (booking_id, station_id, event_type, event_description, performed_by_id, performed_by_name)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.params.id, req.stationId, status, notes || `Status changed to ${status}`, req.user.id, req.user.full_name]
  );
  res.json(rows[0]);
});

// POST /api/bookings/:id/log
router.post('/:id/log', async (req, res) => {
  const { event_type, event_description } = req.body;
  const { rows } = await db.query(
    `INSERT INTO custody_log (booking_id, station_id, event_type, event_description, performed_by_id, performed_by_name)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, req.stationId, event_type, event_description, req.user.id, req.user.full_name]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
