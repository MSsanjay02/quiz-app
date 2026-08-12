const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "admin@quizblast.dev";
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: "Demo Admin" },
  });

  console.log(`Seeded admin: ${admin.email} / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
