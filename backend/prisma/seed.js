import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../src/lib/db.js";

async function main() {
  const ownerMobile = process.env.SEED_OWNER_MOBILE || "9999999999";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || "owner123";
  const passwordHash = await bcrypt.hash(ownerPassword, 10);

  const owner = await prisma.user.upsert({
    where: { mobile: ownerMobile },
    update: {
      role: "OWNER",
      status: "ACTIVE",
    },
    create: {
      name: process.env.SEED_OWNER_NAME || "Owner",
      mobile: ownerMobile,
      email: process.env.SEED_OWNER_EMAIL || "owner@example.com",
      passwordHash,
      role: "OWNER",
    },
  });

  console.log("Seed complete");
  console.log(`Owner login: ${owner.mobile} / ${ownerPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
