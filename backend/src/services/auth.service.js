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
