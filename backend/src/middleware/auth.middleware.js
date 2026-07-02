import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { OWNER_PERMISSIONS, STAFF_PERMISSIONS } from "../utils/permissions.js";
import { getJwtSecret } from "../utils/env.js";

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      throw new ApiError(401, "Authentication required");
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new ApiError(401, "Invalid or inactive user");
    }

    const permissions =
      user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

    req.user = {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      permissions,
    };

    return next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, "Invalid token"));
  }
}
