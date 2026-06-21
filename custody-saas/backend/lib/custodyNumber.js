const prisma = require('./prisma');

async function generateCustodyNumber(stationId) {
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  const year = new Date().getFullYear();
  const count = await prisma.detainee.count({
    where: { stationId, createdAt: { gte: new Date(`${year}-01-01`) } }
  });
  const seq = String(count + 1).padStart(4, '0');
  return `${station.code}-${year}-${seq}`;
}

module.exports = { generateCustodyNumber };
