import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { OWNER_PERMISSIONS, STAFF_PERMISSIONS } from "../utils/permissions.js";

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET || "dev-secret",
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
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    ),
    user,
  };
}

export async function login({ identifier, password }) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ mobile: identifier }, { email: identifier }],
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
  return prisma.user.findMany({
    where: {
      role: "STAFF",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
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

  const staff = await prisma.user.create({
    data: {
      name: data.name,
      mobile: data.mobile,
      email: data.email,
      passwordHash,
      role: "STAFF",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
    },
  });

  return staff;
}

export async function updateStaff(currentUser, staffId, data) {
  const existing = await prisma.user.findUnique({ where: { id: staffId } });
  if (!existing || existing.role !== "STAFF") {
    throw new ApiError(404, "Staff not found");
  }

  const update = {};
  if (data.name) update.name = data.name;
  if (data.mobile) update.mobile = data.mobile;
  if (data.email !== undefined) update.email = data.email;
  if (data.status) update.status = data.status;
  if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

  return prisma.user.update({
    where: { id: staffId },
    data: update,
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      status: true,
    },
  });
}
