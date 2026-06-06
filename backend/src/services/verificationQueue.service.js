import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";

export async function listPendingVerifications(user, { shopId }) {
  await assertShopAccess(user, shopId);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  return prisma.verificationQueue.findMany({
    where: { shopId, status: "PENDING" },
    include: { requestedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function processVerification(user, id, { status, notes }) {
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  
  const verification = await prisma.verificationQueue.findUnique({ where: { id } });
  if (!verification) throw new ApiError(404, "Verification request not found");
  await assertShopAccess(user, verification.shopId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.verificationQueue.update({
      where: { id },
      data: {
        status,
        approvedById: user.id,
        notes: notes || verification.notes
      }
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: verification.shopId,
      action: `verification.${status.toLowerCase()}`,
      entityType: "VerificationQueue",
      entityId: id,
      oldValueJson: verification,
      newValueJson: updated
    });

    return updated;
  });
}
