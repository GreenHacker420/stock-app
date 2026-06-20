import prisma from "../src/lib/db.js";

async function main() {
  try {
    const integrations = await prisma.waIntegration.findMany({});
    console.log("INTEGRATIONS:", JSON.stringify(integrations, null, 2));
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
