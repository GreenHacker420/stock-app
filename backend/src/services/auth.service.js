import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { OWNER_PERMISSIONS, STAFF_PERMISSIONS } from "../utils/permissions.js";
import { getJwtSecret } from "../utils/env.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { createDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";

async function ownerEventShopIds(tx, ownerId, staffId) {
  const [ownedShops, assignedAccesses] = await Promise.all([
    tx.shop.findMany({ where: { ownerId }, select: { id: true } }),
    staffId
      ? tx.staffShopAccess.findMany({ where: { staffId }, select: { shopId: true } })
      : Promise.resolve([]),
  ]);
  return [...new Set([...ownedShops.map((shop) => shop.id), ...assignedAccesses.map((access) => access.shopId)])];
}

function staffDomainEvent({ shopId, action, staffId, actor, targetStaff = false }) {
  return createDomainEvent({
    shopId,
    entity: "staff",
    action,
    entityId: staffId,
    actorUserId: actor.id,
    actorRole: actor.role,
    visibility: targetStaff
      ? { owners: true, staff: false, targetUserIds: [staffId] }
      : { owners: true, staff: false },
    notification: targetStaff
      ? {
          sendPush: true,
          title: "Staff access removed",
          body: "Your ShopControl staff access was removed. Local shop data will be cleared.",
          severity: "critical",
        }
      : undefined,
  });
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}

export function refreshToken(user) {
  return {
    token: jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    ),
    user,
  };
}

export async function login({ identifier, password }) {
  // Normalize mobile: strip spaces, and strip leading +91 prefix if present
  const normalizedIdentifier = identifier.trim().replace(/\s+/g, "").replace(/^\+91/, "");

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: normalizedIdentifier },
        { mobile: identifier.trim() },
        { email: identifier.trim().toLowerCase() },
      ],
    },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new ApiError(401, "Invalid login credentials");
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new ApiError(401, "Invalid login credentials");
  }

  const token = signToken(user);
  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      permissions,
    },
  };
}

export function getCurrentUser(user) {
  return user;
}

export async function updateMe(currentUser, data) {
  const update = {};
  if (data.name) update.name = data.name;
  if (data.email !== undefined) update.email = data.email;
  if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: update,
  });

  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    permissions,
  };
}

export async function listStaff(currentUser) {
  const directShops = await prisma.shop.findMany({
    where: { ownerId: currentUser.id },
    select: { id: true },
  });
  const assignedAccesses = await prisma.staffShopAccess.findMany({
    where: { staffId: currentUser.id },
    select: { shopId: true },
  });

  const shopIds = Array.from(new Set([
    ...directShops.map((s) => s.id),
    ...assignedAccesses.map((a) => a.shopId),
  ]));

  return prisma.user.findMany({
    where: {
      id: { not: currentUser.id },
      OR: [
        { staffOwnerId: currentUser.id },
        {
          staffShopAccesses: {
            some: {
              shopId: { in: shopIds },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      status: true,
      role: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function createStaff(currentUser, data) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: data.mobile },
        data.email ? { email: data.email } : undefined
      ].filter(Boolean),
    },
  });
  if (existing) {
    throw new ApiError(400, "A user with this mobile or email already exists");
  }

  const passwordHash = await bcrypt.hash(data.password || "staff123", 10);

  const staff = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: data.name,
        mobile: data.mobile,
        email: data.email,
        passwordHash,
        role: data.role || "STAFF",
        status: "ACTIVE",
        staffOwnerId: currentUser.id,
      },
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        status: true,
        role: true,
      },
    });

    const shopIds = await ownerEventShopIds(tx, currentUser.id, created.id);
    if (shopIds.length > 0) {
      await enqueueManyDomainEvents(
        tx,
        shopIds.map((shopId) =>
          staffDomainEvent({ shopId, action: "created", staffId: created.id, actor: currentUser }),
        ),
      );
    }

    return created;
  });

  return staff;
}

export async function updateStaff(currentUser, staffId, data) {
  const existing = await prisma.user.findUnique({ where: { id: staffId } });
  if (!existing || existing.staffOwnerId !== currentUser.id) {
    throw new ApiError(404, "User not found");
  }

  if (data.email) {
    const emailConflict = await prisma.user.findFirst({
      where: {
        email: data.email,
        id: { not: staffId },
      },
    });
    if (emailConflict) {
      throw new ApiError(400, "A user with this email already exists");
    }
  }

  if (data.mobile) {
    const mobileConflict = await prisma.user.findFirst({
      where: {
        mobile: data.mobile,
        id: { not: staffId },
      },
    });
    if (mobileConflict) {
      throw new ApiError(400, "A user with this mobile already exists");
    }
  }

  const update = {};
  if (data.name) update.name = data.name;
  if (data.mobile) update.mobile = data.mobile;
  if (data.email !== undefined) update.email = data.email;
  if (data.status) update.status = data.status;
  if (data.role) update.role = data.role;
  if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

  return prisma.$transaction(async (tx) => {
    const staff = await tx.user.update({
      where: { id: staffId },
      data: update,
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        status: true,
        role: true,
      },
    });

    const shopIds = await ownerEventShopIds(tx, currentUser.id, staffId);
    if (shopIds.length > 0) {
      const targetStaff = data.status === "INACTIVE";
      await enqueueManyDomainEvents(
        tx,
        shopIds.map((shopId) =>
          staffDomainEvent({
            shopId,
            action: targetStaff ? "deactivated" : "updated",
            staffId,
            actor: currentUser,
            targetStaff,
          }),
        ),
      );
    }

    return staff;
  });
}

export async function deleteStaff(currentUser, staffId) {
  const existing = await prisma.user.findUnique({ where: { id: staffId } });
  if (!existing || existing.staffOwnerId !== currentUser.id) {
    throw new ApiError(404, "User not found");
  }
  if (existing.role !== "STAFF") {
    throw new ApiError(400, "Only staff accounts can be removed from staff management");
  }

  return prisma.$transaction(async (tx) => {
    const accesses = await tx.staffShopAccess.findMany({
      where: { staffId },
      select: { id: true, shopId: true },
    });
    const shopIds = await ownerEventShopIds(tx, currentUser.id, staffId);

    await tx.staffShopAccess.deleteMany({ where: { staffId } });
    await tx.userDevice.updateMany({
      where: { userId: staffId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        pushToken: null,
        nativePushToken: null,
        voipToken: null,
        notificationsEnabled: false,
        voipEnabled: false,
      },
    });
    const staff = await tx.user.update({
      where: { id: staffId },
      data: {
        status: "INACTIVE",
        pushToken: null,
      },
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        status: true,
        role: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: currentUser.id,
        shopId: shopIds[0] || null,
        action: AuditAction.DELETED,
        entityType: EntityType.USER,
        entityId: staffId,
        oldValueJson: existing,
        newValueJson: { status: "INACTIVE", removedShopAccesses: accesses.map((access) => access.shopId) },
      },
    });

    const events = [];
    for (const shopId of shopIds) {
      events.push(staffDomainEvent({ shopId, action: "deleted", staffId, actor: currentUser, targetStaff: true }));
    }
    for (const access of accesses) {
      events.push(createDomainEvent({
        shopId: access.shopId,
        entity: "shop",
        action: "staff_unassigned",
        entityId: access.id,
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        visibility: { owners: true, staff: false, targetUserIds: [staffId] },
      }));
    }
    if (events.length > 0) await enqueueManyDomainEvents(tx, events);

    return staff;
  });
}

export async function truecallerLogin({ authorizationCode, codeVerifier }) {
  const clientId = process.env.TRUECALLER_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(500, "Truecaller Client ID is not configured on the server");
  }

  // 1. Exchange authorization code for token
  const tokenResponse = await fetch("https://oauth-account-noneu.truecaller.com/v1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: authorizationCode,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Truecaller token exchange failed:", errorText);
    throw new ApiError(401, "Truecaller authentication failed during token exchange");
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new ApiError(401, "No access token received from Truecaller");
  }

  // 2. Fetch user profile
  const profileResponse = await fetch("https://oauth-account-noneu.truecaller.com/v1/userinfo", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!profileResponse.ok) {
    const errorText = await profileResponse.text();
    console.error("Truecaller userinfo fetch failed:", errorText);
    throw new ApiError(401, "Truecaller authentication failed during user profile fetch");
  }

  const profileData = await profileResponse.json();
  const phone = profileData.phone_number;

  if (!phone) {
    throw new ApiError(400, "Truecaller response did not contain a phone number");
  }

  // Extract last 10 digits to match database formats (e.g. 91xxxxxxxxxx vs xxxxxxxxxx)
  const cleanPhone = phone.slice(-10);

  // 3. Find matching active user in DB
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: phone },
        { mobile: { endsWith: cleanPhone } }
      ],
      status: "ACTIVE",
    },
  });

  if (!user) {
    throw new ApiError(401, `Mobile number ${phone} is not registered in ShopControl`);
  }

  // 4. Sign session token
  const token = signToken(user);
  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      permissions,
    },
  };
}

export async function truecallerOtpLogin({ accessToken }) {
  const clientId = process.env.TRUECALLER_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(500, "Truecaller Client ID is not configured on the server");
  }

  // 1. Validate token with Truecaller server
  const response = await fetch(
    `https://sdk-otp-verification-noneu.truecaller.com/v1/otp/client/installation/phoneNumberDetail/${accessToken}`,
    {
      method: "GET",
      headers: {
        clientId: clientId,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Truecaller OTP validation failed:", errorText);
    throw new ApiError(401, "Truecaller OTP validation failed");
  }

  const profileData = await response.json();
  const phoneVal = profileData.phoneNumber || profileData.phone_number;
  if (!phoneVal) {
    throw new ApiError(400, "Truecaller response did not contain a phone number");
  }

  const phoneStr = String(phoneVal);
  const cleanPhone = phoneStr.slice(-10);

  // 2. Find matching active user in DB
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: phoneStr },
        { mobile: { endsWith: cleanPhone } }
      ],
      status: "ACTIVE",
    },
  });

  if (!user) {
    throw new ApiError(401, `Mobile number ${phoneStr} is not registered in ShopControl`);
  }

  // 3. Sign session token
  const token = signToken(user);
  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      permissions,
    },
  };
}
