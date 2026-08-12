const prisma = require("./prisma");

async function generateUniquePin() {
  for (let i = 0; i < 25; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await prisma.quiz.findFirst({
      where: { pin, status: { in: ["PUBLISHED", "LOBBY", "LIVE", "PAUSED"] } },
    });
    if (!existing) return pin;
  }
  throw new Error("Could not generate a unique PIN, try again.");
}

module.exports = { generateUniquePin };
