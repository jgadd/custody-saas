const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { station: { include: { plan: true } } }
    });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid or inactive user' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

const requireActiveSubscription = (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') return next();
  const station = req.user.station;
  if (!station?.isActive) return res.status(403).json({ error: 'Station is inactive' });
  const status = station.subscriptionStatus;
  if (status === 'SUSPENDED' || status === 'CANCELLED') {
    return res.status(402).json({ error: 'Subscription required', status });
  }
  if (status === 'TRIAL' && station.trialEndsAt && new Date() > station.trialEndsAt) {
    return res.status(402).json({ error: 'Trial expired', status: 'TRIAL_EXPIRED' });
  }
  next();
};

module.exports = { authenticate, requireRole, requireActiveSubscription };
