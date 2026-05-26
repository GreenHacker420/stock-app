import { ApiError } from "../utils/ApiError.js";

export const requirePermission = (...requiredPermissions) => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (req.user.role === "OWNER") {
    return next();
  }

  const allowed = requiredPermissions.every((permission) =>
    req.user.permissions.includes(permission),
  );

  if (!allowed) {
    return next(new ApiError(403, "You do not have permission for this action"));
  }

  return next();
};

export const requireOwner = (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (req.user.role !== "OWNER") {
    return next(new ApiError(403, "Owner access required"));
  }

  return next();
};
