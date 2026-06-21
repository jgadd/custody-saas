require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const stationRoutes = require('./routes/stations');
const detaineeRoutes = require('./routes/detainees');
const cellRoutes = require('./routes/cells');
const syncRoutes = require('./routes/sync');
const adminRoutes = require('./routes/admin');
const planRoutes = require('./routes/plans');
const biometricRoutes = require('./routes/biometrics');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Booking photos and fingerprint scans — served back to the frontend
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/detainees', detaineeRoutes);
app.use('/api/cells', cellRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/biometrics', biometricRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date() }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Custody API running on port ${PORT}`));
module.exports = app;
