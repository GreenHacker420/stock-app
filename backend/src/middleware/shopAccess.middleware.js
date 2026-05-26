import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";

export async function assertShopAccess(user, shopId) {
  if (!shopId) {
    throw new ApiError(400, "shopId is required");
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      staffAccesses: {
        where: { staffId: user.id },
        select: { id: true },
      },
    },
  });

  if (!shop || shop.status !== "ACTIVE") {
    throw new ApiError(404, "Shop not found");
  }

  const isOwner = user.role === "OWNER" && shop.ownerId === user.id;
  const isAssignedStaff = user.role === "STAFF" && shop.staffAccesses.length > 0;

  if (!isOwner && !isAssignedStaff) {
    throw new ApiError(403, "You do not have access to this shop");
  }

  return shop;
}

export const requireShopAccess = (getShopId = (req) => req.params.shopId || req.body.shopId) =>
  async (req, _res, next) => {
    try {
      const shopId = getShopId(req);
      req.shop = await assertShopAccess(req.user, shopId);
      return next();
    } catch (error) {
      return next(error);
    }
  };
