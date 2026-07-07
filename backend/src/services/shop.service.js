import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";

export async function listShops(user) {
  const includeStaff = {
    staffAccesses: {
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            mobile: true,
            email: true,
          },
        },
      },
    },
  };

  if (user.role === "OWNER") {
    const directShops = await prisma.shop.findMany({
      where: { ownerId: user.id },
      include: includeStaff,
      orderBy: { createdAt: "desc" },
    });

    const accessShops = await prisma.staffShopAccess.findMany({
      where: { staffId: user.id },
      include: {
        shop: {
          include: includeStaff,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const assignedShops = accessShops.map((access) => access.shop).filter((shop) => shop.status === "ACTIVE");

    const allShops = [...directShops];
    for (const shop of assignedShops) {
      if (!allShops.some((s) => s.id === shop.id)) {
        allShops.push(shop);
      }
    }
    return allShops;
  }

  const accesses = await prisma.staffShopAccess.findMany({
    where: { staffId: user.id },
    include: {
      shop: {
        include: includeStaff,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return accesses.map((access) => access.shop).filter((shop) => shop.status === "ACTIVE");
}

export async function createShop(user, data) {
  const shop = await prisma.$transaction(async (tx) => {
    const created = await tx.shop.create({
      data: {
        name: data.name,
        code: data.code,
        city: data.city,
        address: data.address,
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
        logo: data.logo,
        upiId: data.upiId,
        upiName: data.upiName,
        ownerId: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: created.id,
        action: AuditAction.CREATED,
        entityType: EntityType.SHOP,
        entityId: created.id,
        newValueJson: created,
      }
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId: created.id,
      entity: "shop",
      action: "created",
      entityId: created.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: false },
    }));

    return created;
  });

  return shop;
}

export async function updateShop(user, shopId, data) {
  const existing = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!existing || existing.ownerId !== user.id) {
    throw new ApiError(404, "Shop not found");
  }

  const shop = await prisma.$transaction(async (tx) => {
    const updated = await tx.shop.update({
      where: { id: shopId },
      data,
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId,
        action: AuditAction.UPDATED,
        entityType: EntityType.SHOP,
        entityId: shopId,
        oldValueJson: existing,
        newValueJson: updated,
      }
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId,
      entity: "shop",
      action: "updated",
      entityId: shopId,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    }));

    return updated;
  });

  return shop;
}

export async function assignStaff(user, shopId, staffId) {
  await assertShopAccess(user, shopId);
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new ApiError(404, "Shop not found");
  }

  const staff = await prisma.user.findUnique({
    where: { id: staffId },
  });

  const groupOwnerId = user.staffOwnerId || user.id;
  if (!staff || staff.status !== "ACTIVE" || staff.staffOwnerId !== groupOwnerId) {
    throw new ApiError(400, "Active user not found in your business group");
  }

  const access = await prisma.$transaction(async (tx) => {
    const upserted = await tx.staffShopAccess.upsert({
      where: { staffId_shopId: { staffId, shopId } },
      update: {},
      create: { staffId, shopId },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId,
        action: AuditAction.STAFF_ASSIGNED,
        entityType: EntityType.STAFF_SHOP_ACCESS,
        entityId: upserted.id,
        newValueJson: upserted,
      }
    });

    // Notify the newly assigned staff member directly
    await enqueueDomainEvent(tx, createDomainEvent({
      shopId,
      entity: "shop",
      action: "staff_assigned",
      entityId: upserted.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: false, targetUserIds: [staffId] },
    }));

    return upserted;
  });

  return access;
}

export async function setOpeningStock(user, shopId, entries) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.ownerId !== user.id) {
    throw new ApiError(404, "Shop not found");
  }

  const itemIds = entries.map((entry) => entry.itemId);
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      shopId,
    },
    select: { id: true },
  });

  if (items.length !== new Set(itemIds).size) {
    throw new ApiError(400, "One or more items do not belong to this shop");
  }

  const result = await prisma.$transaction(async (tx) => {
    const rows = await Promise.all(
      entries.map((entry) =>
        tx.stockLedger.create({
          data: {
            shopId,
            itemId: entry.itemId,
            movementType: "OPENING_STOCK",
            quantityIn: entry.quantity,
            quantityOut: 0,
            reason: entry.reason || "Opening stock",
            createdById: user.id,
            approvedById: user.id,
          },
        }),
      ),
    );

    const events = entries.map((entry) =>
      createDomainEvent({
        shopId,
        entity: "stock",
        action: "updated",
        entityId: entry.itemId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      })
    );
    await enqueueManyDomainEvents(tx, events);

    return rows;
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId,
      action: AuditAction.OPENING_SET,
      entityType: EntityType.STOCK_LEDGER,
      newValueJson: { count: result.length },
    }
  });

  return result;
}

export async function unassignStaff(user, shopId, staffId) {
  await assertShopAccess(user, shopId);
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new ApiError(404, "Shop not found");

  const staff = await prisma.user.findUnique({ where: { id: staffId } });
  const groupOwnerId = user.staffOwnerId || user.id;
  if (!staff || staff.staffOwnerId !== groupOwnerId) {
    throw new ApiError(400, "User not found in your business group");
  }

  const access = await prisma.staffShopAccess.findUnique({
    where: { staffId_shopId: { staffId, shopId } },
  });

  if (!access) {
    throw new ApiError(400, "Staff is not assigned to this shop");
  }

  await prisma.$transaction(async (tx) => {
    await tx.staffShopAccess.delete({
      where: { id: access.id },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId,
        action: AuditAction.DELETED,
        entityType: EntityType.STAFF_SHOP_ACCESS,
        entityId: access.id,
        newValueJson: { unassigned: true, staffId, shopId },
      }
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId,
      entity: "shop",
      action: "staff_unassigned",
      entityId: access.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: false, targetUserIds: [staffId] },
    }));
  });

  return { success: true };
}

export async function copyCatalog(user, { sourceShopId, targetShopId, overwrite = false, categoryIds, itemIds }) {
  // Validate that user owns both shops
  const sourceShop = await prisma.shop.findFirst({
    where: { id: sourceShopId, ownerId: user.id },
  });
  const targetShop = await prisma.shop.findFirst({
    where: { id: targetShopId, ownerId: user.id },
  });

  if (!sourceShop || !targetShop) {
    throw new ApiError(403, "You do not have owner access to one or both of these shops");
  }

  return await prisma.$transaction(async (tx) => {
    const events = [];
    
    // 1. Copy Categories
    let catFilter = {};
    if (categoryIds && categoryIds.length > 0) {
      catFilter = { id: { in: categoryIds }, shopId: sourceShopId };
    } else if (itemIds && itemIds.length > 0) {
      const selectedItems = await tx.item.findMany({
        where: { id: { in: itemIds }, shopId: sourceShopId },
        select: { categoryId: true },
      });
      const uniqueCatIds = [...new Set(selectedItems.map(i => i.categoryId).filter(Boolean))];
      catFilter = { id: { in: uniqueCatIds }, shopId: sourceShopId };
    } else {
      catFilter = { shopId: sourceShopId };
    }

    const sourceCategories = await tx.itemCategory.findMany({
      where: catFilter,
    });

    const categoryMap = new Map(); // oldId -> newId

    for (const cat of sourceCategories) {
      // Check if category already exists in target shop by name
      let targetCat = await tx.itemCategory.findFirst({
        where: { shopId: targetShopId, name: cat.name },
      });

      if (!targetCat) {
        targetCat = await tx.itemCategory.create({
          data: {
            shopId: targetShopId,
            name: cat.name,
            status: cat.status,
          },
        });
        events.push(createDomainEvent({
          shopId: targetShopId,
          entity: "category",
          action: "created",
          entityId: targetCat.id,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }));
      }

      categoryMap.set(cat.id, targetCat.id);
    }

    // 2. Copy Brands
    let brandFilter = {};
    if (itemIds && itemIds.length > 0) {
      const selectedItems = await tx.item.findMany({
        where: { id: { in: itemIds }, shopId: sourceShopId },
        select: { brandId: true },
      });
      const uniqueBrandIds = [...new Set(selectedItems.map(i => i.brandId).filter(Boolean))];
      brandFilter = { id: { in: uniqueBrandIds }, shopId: sourceShopId };
    } else if (categoryIds && categoryIds.length > 0) {
      const selectedItems = await tx.item.findMany({
        where: { categoryId: { in: categoryIds }, shopId: sourceShopId },
        select: { brandId: true },
      });
      const uniqueBrandIds = [...new Set(selectedItems.map(i => i.brandId).filter(Boolean))];
      brandFilter = { id: { in: uniqueBrandIds }, shopId: sourceShopId };
    } else {
      brandFilter = { shopId: sourceShopId };
    }

    const sourceBrands = await tx.itemBrand.findMany({
      where: brandFilter,
    });

    const brandMap = new Map(); // oldId -> newId

    for (const brand of sourceBrands) {
      let targetBrand = await tx.itemBrand.findFirst({
        where: { shopId: targetShopId, name: brand.name },
      });

      if (!targetBrand) {
        targetBrand = await tx.itemBrand.create({
          data: {
            shopId: targetShopId,
            name: brand.name,
          },
        });
        events.push(createDomainEvent({
          shopId: targetShopId,
          entity: "brand",
          action: "created",
          entityId: targetBrand.id,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }));
      }

      brandMap.set(brand.id, targetBrand.id);
    }

    // 3. Copy Items
    const sourceItems = await tx.item.findMany({
      where: { 
        shopId: sourceShopId,
        ...(itemIds && itemIds.length > 0 ? { id: { in: itemIds } } : 
            (categoryIds && categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}))
      },
    });

    let copiedCount = 0;
    let skippedCount = 0;

    for (const item of sourceItems) {
      const targetCategoryId = item.categoryId ? categoryMap.get(item.categoryId) || null : null;
      const targetBrandId = item.brandId ? brandMap.get(item.brandId) || null : null;

      // Direct copy
      const exists = await tx.item.findFirst({
        where: {
          shopId: targetShopId,
          OR: [
            { name: item.name },
            ...(item.sku ? [{ sku: item.sku }] : []),
          ],
        },
      });

      if (exists) {
        if (overwrite) {
          await tx.item.update({
            where: { id: exists.id },
            data: {
              categoryId: targetCategoryId,
              brandId: targetBrandId,
              unit: item.unit,
              defaultSellingPrice: item.defaultSellingPrice,
              minimumAllowedPrice: item.minimumAllowedPrice,
              purchasePrice: item.purchasePrice,
              mrp: item.mrp,
              minimumStock: item.minimumStock,
              imageUrl: item.imageUrl,
              status: item.status,
              requiresSerialNumber: item.requiresSerialNumber,
            },
          });
          events.push(createDomainEvent({
            shopId: targetShopId,
            entity: "item",
            action: "updated",
            entityId: exists.id,
            actorUserId: user.id,
            actorRole: user.role,
            visibility: { owners: true, staff: true },
          }));
          copiedCount++;
        } else {
          skippedCount++;
        }
      } else {
        const createdItem = await tx.item.create({
          data: {
            shopId: targetShopId,
            name: item.name,
            sku: item.sku,
            categoryId: targetCategoryId,
            brandId: targetBrandId,
            unit: item.unit,
            defaultSellingPrice: item.defaultSellingPrice,
            minimumAllowedPrice: item.minimumAllowedPrice,
            purchasePrice: item.purchasePrice,
            mrp: item.mrp,
            minimumStock: item.minimumStock,
            imageUrl: item.imageUrl,
            status: item.status,
            requiresSerialNumber: item.requiresSerialNumber,
          },
        });
        events.push(createDomainEvent({
          shopId: targetShopId,
          entity: "item",
          action: "created",
          entityId: createdItem.id,
          actorUserId: user.id,
          actorRole: user.role,
          visibility: { owners: true, staff: true },
        }));
        copiedCount++;
      }
    }

    // Write audit log
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: targetShopId,
        action: AuditAction.UPDATED,
        entityType: EntityType.SHOP,
        entityId: targetShopId,
        newValueJson: { copyCatalog: { sourceShopId, targetShopId, copiedCount, skippedCount, overwrite } },
      }
    });

    if (events.length > 0) await enqueueManyDomainEvents(tx, events);

    return { success: true, copiedCount, skippedCount };
  });
}
