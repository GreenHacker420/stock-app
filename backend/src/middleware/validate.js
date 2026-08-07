import { z } from "zod";
import { ApiError } from "../utils/ApiError.js";

export const validate = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!parsed.success) {
    const details = z.flattenError(parsed.error);
    console.log("Validation Error:", JSON.stringify(details, null, 2));
    return next(new ApiError(400, "Validation failed", details));
  }

  req.validated = parsed.data;
  return next();
};
