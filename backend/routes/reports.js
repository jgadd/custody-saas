const router = require('express').Router();
const db = require('../db');
const { authenticate, requireStation } = require('../middleware/auth');

router.use(authenticate, requireStation);

// Daily custody report
router.get('/daily', async (req, res) => {
  const { date } = req.query;
  const reportDate = date || new Date().toISOString().split('T')[0];

  const [summaryR, bookingsR, releasedR] = await Promise.all([
    db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status='in_custody') AS in_custody,
         COUNT(*) FILTER (WHERE booked_in_at::date = $2) AS booked_today,
         COUNT(*) FILTER (WHERE released_at::date = $2) AS released_today,
         COUNT(*) FILTER (WHERE status='court') AS at_court
       FROM bookings WHERE station_id=$1`,
      [req.stationId, reportDate]
    ),
    db.query(
      `SELECT b.booking_number, b.booked_in_at, b.charge_description, b.risk_level,
              b.status, c.cell_number, d.first_name || ' ' || d.last_name AS detainee_name, d.gender
       FROM bookings b JOIN detainees d ON b.detainee_id = d.id LEFT JOIN cells c ON b.cell_id = c.id
       WHERE b.station_id=$1 AND b.booked_in_at::date = $2 ORDER BY b.booked_in_at`,
      [req.stationId, reportDate]
    ),
    db.query(
      `SELECT b.booking_number, b.released_at, b.release_reason,
              d.first_name || ' ' || d.last_name AS detainee_name
       FROM bookings b JOIN detainees d ON b.detainee_id = d.id
       WHERE b.station_id=$1 AND b.released_at::date = $2`,
      [req.stationId, reportDate]
    ),
  ]);

  res.json({
    date: reportDate,
    summary: summaryR.rows[0],
    booked_in: bookingsR.rows,
    released: releasedR.rows,
  });
});

// Analytics - weekly/monthly trends
router.get('/analytics', async (req, res) => {
  const { rows: weekly } = await db.query(
    `SELECT DATE_TRUNC('day', booked_in_at)::date AS day, COUNT(*) AS bookings
     FROM bookings WHERE station_id=$1 AND booked_in_at > NOW() - INTERVAL '30 days'
     GROUP BY day ORDER BY day`,
    [req.stationId]
  );
  const { rows: byCharge } = await db.query(
    `SELECT charge_severity, COUNT(*) AS count FROM bookings WHERE station_id=$1 GROUP BY charge_severity`,
    [req.stationId]
  );
  const { rows: byCell } = await db.query(
    `SELECT c.cell_number, COUNT(b.id) AS total_bookings,
            COUNT(b.id) FILTER (WHERE b.status='in_custody') AS current
     FROM cells c LEFT JOIN bookings b ON b.cell_id = c.id
     WHERE c.station_id=$1 GROUP BY c.id ORDER BY c.cell_number`,
    [req.stationId]
  );
  res.json({ weekly_bookings: weekly, by_charge_severity: byCharge, by_cell: byCell });
});

module.exports = router;
