const prisma = require('./prisma');

async function audit(stationId, userId, action, entity, entityId, changes, ipAddress) {
  try {
    await prisma.auditLog.create({
      data: { stationId, userId, action, entity, entityId, changes, ipAddress }
    });
  } catch (e) { console.error('Audit log failed:', e); }
}

module.exports = { audit };
