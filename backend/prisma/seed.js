import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../src/lib/db.js";
import { OWNER_PERMISSIONS, STAFF_PERMISSIONS } from "../src/utils/permissions.js";

async function upsertRoleWithPermissions(name, permissions) {
  const role = await prisma.role.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  await Promise.all(
    permissions.map((action) =>
      prisma.permission.upsert({
        where: {
          roleId_action: {
            roleId: role.id,
            action,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          action,
        },
      }),
    ),
  );

  return role;
}

async function main() {
  const ownerRole = await upsertRoleWithPermissions("OWNER", OWNER_PERMISSIONS);
  await upsertRoleWithPermissions("STAFF", STAFF_PERMISSIONS);

  const ownerMobile = process.env.SEED_OWNER_MOBILE || "9999999999";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || "owner123";
  const passwordHash = await bcrypt.hash(ownerPassword, 10);

  const owner = await prisma.user.upsert({
    where: { mobile: ownerMobile },
    update: {
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
    create: {
      name: process.env.SEED_OWNER_NAME || "Owner",
      mobile: ownerMobile,
      email: process.env.SEED_OWNER_EMAIL || "owner@example.com",
      passwordHash,
      roleId: ownerRole.id,
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
