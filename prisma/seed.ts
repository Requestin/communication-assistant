import { PrismaClient } from "@prisma/client";
import { seedUsers } from "../src/lib/seed-users";

const prisma = new PrismaClient();

async function main() {
  await seedUsers(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
