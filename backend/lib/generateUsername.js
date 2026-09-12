const prisma = require('./prisma');

/**
 * Auto-generates a username from a full name.
 * Formula: first initial + last name, lowercase, letters/numbers only.
 * Examples: "Joshua Gadd" -> "jgadd", "Mary Tua" -> "mtua"
 * Appends a number if already taken: jgadd2, jgadd3 etc.
 */
async function generateUsername(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const base = (parts[0][0] + parts[parts.length - 1])
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  let username = base;
  let n = 2;
  while (await prisma.user.findUnique({ where: { username } })) {
    username = base + n++;
  }
  return username;
}

module.exports = { generateUsername };
