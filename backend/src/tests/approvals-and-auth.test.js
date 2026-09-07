import test from "node:test";
import assert from "node:assert";
import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import * as authService from "../services/auth.service.js";
import * as approvalService from "../services/approval.service.js";
import { getJwtSecret } from "../utils/env.js";

test("Approvals & Auth System Enhancements", async (t) => {
  const testMobile = "9999988888";
  let user = await prisma.user.findFirst({ where: { mobile: testMobile } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: "Approval Test Owner",
        mobile: testMobile,
        role: "OWNER",
        status: "ACTIVE",
        passwordHash: "dummy",
      },
    });
  }

  let shop = await prisma.shop.findFirst({ where: { ownerId: user.id } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        name: "Approval Test Shop",
        code: "APPRV1",
        city: "Mumbai",
        ownerId: user.id,
      },
    });
  }

  const staff = await prisma.user.create({
    data: {
      name: "Approval Test Staff",
      mobile: `9999${Date.now().toString().slice(-6)}`,
      role: "STAFF",
      status: "ACTIVE",
      passwordHash: "dummy",
    },
  });

  const item = await prisma.item.create({
    data: {
      shopId: shop.id,
      name: "Bulk Approval Test Item",
      unit: "PCS",
      defaultSellingPrice: 100,
    },
  });

  await t.test("1. createApprovalRequest and Redis cache invalidation", async () => {
    const req1 = await prisma.$transaction(async (tx) => {
      return approvalService.createApprovalRequest(tx, {
        shopId: shop.id,
        type: "STOCK_ENTRY",
        entityType: "SHOP",
        entityId: shop.id,
        payloadJson: {
          entries: [{ itemId: item.id, quantity: 15 }],
          notes: "Staff bulk stock in",
        },
        reason: "Staff bulk stock in",
        requestedById: staff.id,
      });
    });

    assert.ok(req1.id);
    assert.strictEqual(req1.status, "PENDING");

    const list = await approvalService.listApprovalRequests(user, { shopId: shop.id, status: "PENDING" });
    assert.ok(Array.isArray(list));
    const found = list.find((r) => r.id === req1.id);
    assert.ok(found, "Newly created approval request should be in cached list");
  });

  await t.test("2. bulkRespondToRequests successfully approves multiple pending requests", async () => {
    const reqA = await prisma.$transaction(async (tx) => {
      return approvalService.createApprovalRequest(tx, {
        shopId: shop.id,
        type: "STOCK_ENTRY",
        entityType: "SHOP",
        entityId: shop.id,
        payloadJson: { entries: [{ itemId: item.id, quantity: 5 }] },
        reason: "Item A",
        requestedById: staff.id,
      });
    });

    const reqB = await prisma.$transaction(async (tx) => {
      return approvalService.createApprovalRequest(tx, {
        shopId: shop.id,
        type: "STOCK_ENTRY",
        entityType: "SHOP",
        entityId: shop.id,
        payloadJson: { entries: [{ itemId: item.id, quantity: 10 }] },
        reason: "Item B",
        requestedById: staff.id,
      });
    });

    const result = await approvalService.bulkRespondToRequests(user, {
      ids: [reqA.id, reqB.id],
      status: "APPROVED",
    });

    assert.strictEqual(result.processed, 2);
    assert.deepStrictEqual(result.successIds.sort(), [reqA.id, reqB.id].sort());
    assert.strictEqual(result.failed.length, 0);

    const checkA = await prisma.approvalRequest.findUnique({ where: { id: reqA.id } });
    const checkB = await prisma.approvalRequest.findUnique({ where: { id: reqB.id } });
    assert.strictEqual(checkA.status, "APPROVED");
    assert.strictEqual(checkB.status, "APPROVED");
  });

  await t.test("3. logoutUser revokes device, clears pushToken, and updates UserDevice", async () => {
    const installationId = `test-inst-${Date.now()}`;
    const device = await prisma.userDevice.create({
      data: {
        userId: user.id,
        installationId,
        platform: "ANDROID",
        pushToken: "ExponentPushToken[dummy-test-logout]",
        notificationsEnabled: true,
      },
    });

    assert.strictEqual(device.revokedAt, null);
    assert.strictEqual(device.notificationsEnabled, true);

    await authService.logoutUser(user.id, installationId);

    const updatedDevice = await prisma.userDevice.findUnique({ where: { id: device.id } });
    assert.ok(updatedDevice.revokedAt !== null, "Device should be marked revoked");
    assert.strictEqual(updatedDevice.pushToken, null, "Push token should be cleared");
    assert.strictEqual(updatedDevice.notificationsEnabled, false, "Notifications should be disabled");
  });

  await t.test("4. refreshTokenWithGrace successfully renews expired token within grace period", async () => {
    const expiredToken = jwt.sign(
      { sub: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: "-1h" }, // Expired 1 hour ago
    );

    const renewed = await authService.refreshTokenWithGrace(expiredToken);
    assert.ok(renewed.token, "Should issue a new token");
    assert.strictEqual(renewed.user.id, user.id);

    const verified = jwt.verify(renewed.token, getJwtSecret());
    assert.strictEqual(verified.sub, user.id);
    assert.ok(verified.exp > Math.floor(Date.now() / 1000));
  });

  await t.test("5. refreshTokenWithGrace rejects expired tokens beyond grace period", async () => {
    const ancientToken = jwt.sign(
      { sub: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: "-10d" }, // Expired 10 days ago (beyond 7-day grace)
    );

    await assert.rejects(
      async () => authService.refreshTokenWithGrace(ancientToken),
      (err) => err.message.includes("Session expired") || err.status === 401,
    );
  });

  await t.test("6. Notification routing: only particular staff gets notification of approved, nothing else", async () => {
    const { getNotificationTargetUserIds } = await import("../workers/domain-event-dispatcher.worker.js");

    const otherStaff = await prisma.user.create({
      data: {
        name: "Other Peer Staff",
        mobile: `9998${Date.now().toString().slice(-6)}`,
        role: "STAFF",
        status: "ACTIVE",
        passwordHash: "dummy",
      },
    });

    // 6a. Creation event: Target is owner, NOT staff who requested it, NOT other staff
    const creationTargets = await getNotificationTargetUserIds({
      shopId: shop.id,
      entity: "approval",
      action: "created",
      actorUserId: staff.id,
      actorRole: "STAFF",
    });
    assert.ok(creationTargets.includes(user.id), "Owner should receive approval request notification");
    assert.ok(!creationTargets.includes(staff.id), "Requester staff must NOT receive approval request notification");
    assert.ok(!creationTargets.includes(otherStaff.id), "Other staff must NOT receive approval request notification");

    // 6b. Approved event: ONLY the particular staff who requested it receives the notification
    const approvedTargets = await getNotificationTargetUserIds({
      shopId: shop.id,
      entity: "approval",
      action: "approved",
      actorUserId: user.id, // Owner approved it
      actorRole: "OWNER",
      requestedById: staff.id,
      visibility: { owners: false, staff: false, targetUserIds: [staff.id] },
    });
    assert.deepStrictEqual(approvedTargets, [staff.id], "Only the particular staff who requested should be targeted on approved");
    assert.ok(!approvedTargets.includes(user.id), "Approver owner must not receive notification for their own action");
    assert.ok(!approvedTargets.includes(otherStaff.id), "Other staff must not receive notification for peer approval");

    // 6c. Rejected event: ONLY the particular staff who requested it receives the rejection notification
    const rejectedTargets = await getNotificationTargetUserIds({
      shopId: shop.id,
      entity: "approval",
      action: "rejected",
      actorUserId: user.id,
      actorRole: "OWNER",
      requestedById: staff.id,
      visibility: { owners: false, staff: false, targetUserIds: [staff.id] },
    });
    assert.deepStrictEqual(rejectedTargets, [staff.id], "Only the particular staff who requested should be targeted on rejected");
    assert.ok(!rejectedTargets.includes(user.id), "Approver owner must not receive notification for their own rejection action");
    assert.ok(!rejectedTargets.includes(otherStaff.id), "Other staff must not receive notification for peer rejection");

    await prisma.user.delete({ where: { id: otherStaff.id } });
  });

  // Cleanup
  await prisma.stockLedger.deleteMany({ where: { itemId: item.id } });
  await prisma.approvalRequest.deleteMany({ where: { shopId: shop.id } });
  await prisma.userDevice.deleteMany({ where: { userId: user.id } });
  await prisma.item.delete({ where: { id: item.id } });
  await prisma.user.delete({ where: { id: staff.id } });
});
