import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role.name,
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
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
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

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role.name,
      permissions: user.role.permissions.map((permission) => permission.action),
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
    include: { role: { include: { permissions: true } } },
  });

  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    role: user.role.name,
    permissions: user.role.permissions.map((permission) => permission.action),
  };
}

export async function listStaff(currentUser) {
  const staffRole = await prisma.role.findUnique({
    where: { name: "STAFF" },
  });
  if (!staffRole) {
    return [];
  }
  return prisma.user.findMany({
    where: {
      roleId: staffRole.id,
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
  const staffRole = await prisma.role.findUnique({
    where: { name: "STAFF" },
  });
  if (!staffRole) {
    throw new ApiError(500, "Staff role not found in system");
  }

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
      roleId: staffRole.id,
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
  const staffRole = await prisma.role.findUnique({ where: { name: "STAFF" } });
  const existing = await prisma.user.findUnique({ where: { id: staffId } });
  if (!existing || existing.roleId !== staffRole?.id) {
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
