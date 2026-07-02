import { ApiError } from "../utils/ApiError.js";
import { Prisma } from "../generated/prisma/index.js";

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, _req, res, _next) {
  // Prisma unique constraint violation → 409 Conflict
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const fields = error.meta?.target ?? [];
    const fieldList = Array.isArray(fields) ? fields : [fields];
    // Build a human-readable field name (e.g. "code" → "Shop Code")
    const fieldLabel = fieldList
      .map((f) => f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, " "))
      .join(", ");
    return res.status(409).json({
      success: false,
      message: `${fieldLabel} already exists. Please use a different value.`,
      field: fieldList[0] ?? null,
      details: null,
    });
  }

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : error.message;

  if (statusCode === 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: error.details || null,
  });
}
