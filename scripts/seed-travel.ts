import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { seedTravel } from "../src/lib/travel/seed";

config({ path: ".env" });

const prisma = new PrismaClient();
const force = process.argv.includes("--force");

async function main() {
  const result = await seedTravel(prisma, { force });

  if (result.skipped) {
    console.log("уже залито");
  }

  console.log(`города: ${result.cities}`);
  console.log(`отели: ${result.hotels}`);
  console.log(`рейсы: ${result.flights}`);
  console.log(`наличие: ${result.availability}`);
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
