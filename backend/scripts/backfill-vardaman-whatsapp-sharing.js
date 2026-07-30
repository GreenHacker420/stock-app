import "dotenv/config";
import prisma from "../src/lib/db.js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

const config = {
  primaryShopCode: "VS",
  branchShopCode: "VS-BURDI",
  tenantName: "Vardaman",
  groupName: "Vardaman Sales",
  groupCode: "VARDAMAN-SALES",
  callPhone: "9329470933",
  expectedPhoneNumberId: "1271752386017174",
};

function summary({ primary, branch, integration, tenant, group }) {
  return {
    mode: apply ? "APPLY" : "DRY_RUN",
    tenant: tenant
      ? { id: tenant.id, name: tenant.name }
      : { name: config.tenantName, create: true },
    group: group
      ? { id: group.id, code: group.code }
      : { code: config.groupCode, create: true },
    branches: [
      { id: primary.id, code: primary.code, name: primary.name },
      { id: branch.id, code: branch.code, name: branch.name },
    ],
    channel: {
      id: integration.id,
      phoneNumberId: integration.phoneNumberId,
      phoneNumber: integration.phoneNumber,
    },
    callPhone: config.callPhone,
  };
}

async function loadPreflight(db = prisma) {
  const [primary, branch] = await Promise.all([
    db.shop.findUnique({
      where: { code: config.primaryShopCode },
      include: { staffAccesses: { select: { staffId: true } } },
    }),
    db.shop.findUnique({
      where: { code: config.branchShopCode },
      include: { staffAccesses: { select: { staffId: true } } },
    }),
  ]);
  if (!primary || !branch) {
    throw new Error("Expected VS and VS-BURDI shop rows were not both found");
  }
  if (primary.ownerId !== branch.ownerId) {
    throw new Error("Vardaman branches do not have the same owner");
  }

  const integration = await db.waIntegration.findFirst({
    where: {
      shopId: primary.id,
      phoneNumberId: config.expectedPhoneNumberId,
      status: "CONNECTED",
      isArchived: false,
    },
  });
  if (!integration) {
    throw new Error("The connected 7400707155 WhatsApp channel was not found on VS");
  }

  const branchOwnedChannel = await db.waIntegration.findFirst({
    where: {
      shopId: branch.id,
      status: "CONNECTED",
      isArchived: false,
    },
  });
  if (branchOwnedChannel && branchOwnedChannel.id !== integration.id) {
    throw new Error("VS-BURDI already owns a different connected WhatsApp channel");
  }

  const tenant = await db.tenant.findFirst({
    where: { ownerId: primary.ownerId, name: config.tenantName },
  });
  const group = tenant
    ? await db.shopGroup.findUnique({
        where: {
          tenantId_code: {
            tenantId: tenant.id,
            code: config.groupCode,
          },
        },
      })
    : null;

  return { primary, branch, integration, tenant, group };
}

async function run() {
  const preflight = await loadPreflight();
  console.log(JSON.stringify(summary(preflight), null, 2));
  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing this summary.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = preflight.tenant || await tx.tenant.create({
      data: {
        name: config.tenantName,
        ownerId: preflight.primary.ownerId,
      },
    });
    await tx.tenantMember.upsert({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: preflight.primary.ownerId,
        },
      },
      create: {
        tenantId: tenant.id,
        userId: preflight.primary.ownerId,
        role: "OWNER",
      },
      update: { role: "OWNER" },
    });

    const staffIds = new Set([
      ...preflight.primary.staffAccesses.map(({ staffId }) => staffId),
      ...preflight.branch.staffAccesses.map(({ staffId }) => staffId),
    ]);
    for (const userId of staffIds) {
      if (userId === preflight.primary.ownerId) continue;
      await tx.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId } },
        create: { tenantId: tenant.id, userId, role: "MEMBER" },
        update: {},
      });
    }

    const group = preflight.group || await tx.shopGroup.create({
      data: {
        tenantId: tenant.id,
        name: config.groupName,
        code: config.groupCode,
        callPhone: config.callPhone,
      },
    });
    await tx.shopGroup.update({
      where: { id: group.id },
      data: {
        name: config.groupName,
        callPhone: config.callPhone,
        defaultWaIntegrationId: preflight.integration.id,
      },
    });

    await tx.shop.updateMany({
      where: { id: { in: [preflight.primary.id, preflight.branch.id] } },
      data: {
        tenantId: tenant.id,
        shopGroupId: group.id,
        phone: config.callPhone,
      },
    });
    await tx.waIntegration.update({
      where: { id: preflight.integration.id },
      data: { tenantId: tenant.id },
    });

    for (const shop of [preflight.primary, preflight.branch]) {
      await tx.waIntegrationShopAccess.upsert({
        where: {
          integrationId_shopId: {
            integrationId: preflight.integration.id,
            shopId: shop.id,
          },
        },
        create: {
          integrationId: preflight.integration.id,
          shopId: shop.id,
          canView: true,
          canSend: true,
          canManage: shop.id === preflight.primary.id,
          isPrimary: true,
        },
        update: {
          canView: true,
          canSend: true,
          canManage: shop.id === preflight.primary.id,
          isPrimary: true,
        },
      });
    }

    const [templates, flows, broadcasts] = await Promise.all([
      tx.waTemplate.updateMany({
        where: { shopId: preflight.primary.id, integrationId: null },
        data: { integrationId: preflight.integration.id },
      }),
      tx.waFlow.updateMany({
        where: { shopId: preflight.primary.id, integrationId: null },
        data: { integrationId: preflight.integration.id },
      }),
      tx.waBroadcast.updateMany({
        where: { shopId: preflight.primary.id, integrationId: null },
        data: { integrationId: preflight.integration.id },
      }),
    ]);

    return {
      tenantId: tenant.id,
      shopGroupId: group.id,
      integrationId: preflight.integration.id,
      memberCount: staffIds.size + 1,
      templatesAssigned: templates.count,
      flowsAssigned: flows.count,
      broadcastsAssigned: broadcasts.count,
    };
  });

  console.log(JSON.stringify({ applied: true, ...result }, null, 2));
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
