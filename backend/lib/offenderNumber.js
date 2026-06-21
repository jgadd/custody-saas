const prisma = require('./prisma');

async function generateOffenderNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.offender.count({
    where: { createdAt: { gte: new Date(`${year}-01-01`) } }
  });
  const seq = String(count + 1).padStart(6, '0');
  return `OFF-${year}-${seq}`;
}

module.exports = { generateOffenderNumber };
