import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

export async function checkIn(user, { shopId, note }) {
  await assertShopAccess(user, shopId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId: user.id, date: today } }
  });

  if (existing) {
    throw new ApiError(400, "Already checked in for today");
  }

  return prisma.attendance.create({
    data: {
      shopId,
      staffId: user.id,
      date: today,
      checkIn: new Date(),
      status: "PRESENT",
      note
    }
  });
}

export async function checkOut(user, { shopId, note }) {
  await assertShopAccess(user, shopId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId: user.id, date: today } }
  });

  if (!existing) {
    throw new ApiError(400, "No check-in found for today");
  }

  if (existing.checkOut) {
    throw new ApiError(400, "Already checked out for today");
  }

  return prisma.attendance.update({
    where: { id: existing.id },
    data: {
      checkOut: new Date(),
      note: note || existing.note
    }
  });
}

export async function listAttendance(user, { shopId, staffId, dateFrom, dateTo }) {
  if (shopId) await assertShopAccess(user, shopId);
  const shopIds = shopId ? [shopId] : undefined;

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
    orderBy: { date: "desc" }
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
