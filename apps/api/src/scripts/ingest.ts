import { prisma } from "../lib/prisma.js";
import { runIngestion } from "../services/ingestion.js";

async function main() {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const result = await runIngestion(date);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
