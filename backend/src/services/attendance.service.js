import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";

export async function checkIn(user, { shopId, note, staffId }) {
  await assertShopAccess(user, shopId);
  
  let targetStaffId = user.id;
  if (staffId && staffId !== user.id) {
    if (user.role !== "OWNER") {
      throw new ApiError(403, "Only owners can mark attendance for other staff members");
    }
    targetStaffId = staffId;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId: targetStaffId, date: today } }
  });

  if (existing) {
    throw new ApiError(400, "Already checked in for today");
  }

  return prisma.$transaction(async (tx) => {
    const attendance = await tx.attendance.create({
      data: {
        shopId,
        staffId: targetStaffId,
        date: today,
        checkIn: new Date(),
        status: "PRESENT",
        note
      }
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId,
      entity: "attendance",
      action: "checked_in",
      entityId: attendance.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true, targetUserIds: [targetStaffId] },
    }));

    return attendance;
  });
}

export async function checkOut(user, { shopId, note, staffId }) {
  await assertShopAccess(user, shopId);

  let targetStaffId = user.id;
  if (staffId && staffId !== user.id) {
    if (user.role !== "OWNER") {
      throw new ApiError(403, "Only owners can mark attendance for other staff members");
    }
    targetStaffId = staffId;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId: targetStaffId, date: today } }
  });

  if (!existing) {
    throw new ApiError(400, "No check-in found for today");
  }

  if (existing.checkOut) {
    throw new ApiError(400, "Already checked out for today");
  }

  return prisma.$transaction(async (tx) => {
    const attendance = await tx.attendance.update({
      where: { id: existing.id },
      data: {
        checkOut: new Date(),
        note: note || existing.note
      }
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId,
      entity: "attendance",
      action: "checked_out",
      entityId: attendance.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true, targetUserIds: [targetStaffId] },
    }));

    return attendance;
  });
}

export async function listAttendance(user, { shopId, staffId, dateFrom, dateTo, page = 1, limit = 50 }) {
  if (shopId) await assertShopAccess(user, shopId);
  const shopIds = shopId ? [shopId] : undefined;
  const take = Math.min(Number(limit) || 50, 200);
  const skip = (Math.max(Number(page), 1) - 1) * take;

  return prisma.attendance.findMany({
    where: {
      shopId: shopIds ? { in: shopIds } : undefined,
      staffId: staffId || undefined,
      date: {
        gte: dateFrom ? new Date(dateFrom) : undefined,
        lte: dateTo ? new Date(dateTo) : undefined,
      }
    },
    include: {
      staff: { select: { id: true, name: true } },
      shop: { select: { id: true, name: true } }
    },
    orderBy: { date: "desc" },
    skip,
    take,
  });
}

export async function requestLeave(user, { startDate, endDate, reason }) {
  return prisma.leaveRequest.create({
    data: {
      staffId: user.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      status: "PENDING"
    }
  });
}

export async function respondToLeave(user, id, { status }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  return prisma.leaveRequest.update({
    where: { id },
    data: {
      status,
      approvedById: user.id
    }
  });
}
