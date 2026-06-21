const router = require('express').Router();
const db = require('../db');
const { authenticate, requireStation } = require('../middleware/auth');

router.use(authenticate, requireStation);

router.post('/', async (req, res) => {
  const { booking_id, condition, notes, local_id } = req.body;
  const { rows } = await db.query(
    `INSERT INTO welfare_checks (booking_id, station_id, checked_by_id, checked_by_name, condition, notes, local_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [booking_id, req.stationId, req.user.id, req.user.full_name, condition || 'well', notes, local_id || null]
  );
  await db.query(
    `INSERT INTO custody_log (booking_id, station_id, event_type, event_description, performed_by_id, performed_by_name)
     VALUES ($1,$2,'welfare_check',$3,$4,$5)`,
    [booking_id, req.stationId, `Welfare check: ${condition} - ${notes || 'No issues'}`, req.user.id, req.user.full_name]
  );
  res.status(201).json(rows[0]);
});

router.get('/due', async (req, res) => {
  // Bookings that haven't had a welfare check in 4+ hours
  const { rows } = await db.query(
    `SELECT b.id, b.booking_number, d.first_name || ' ' || d.last_name AS detainee_name,
            b.booked_in_at, c.cell_number,
            MAX(w.checked_at) AS last_welfare_check
     FROM bookings b
     JOIN detainees d ON b.detainee_id = d.id
     LEFT JOIN cells c ON b.cell_id = c.id
     LEFT JOIN welfare_checks w ON w.booking_id = b.id
     WHERE b.station_id=$1 AND b.status='in_custody'
     GROUP BY b.id, d.first_name, d.last_name, c.cell_number
     HAVING MAX(w.checked_at) IS NULL OR MAX(w.checked_at) < NOW() - INTERVAL '4 hours'
     ORDER BY b.booked_in_at`,
    [req.stationId]
  );
  res.json(rows);
});

module.exports = router;
