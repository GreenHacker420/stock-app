import { ApiError } from "../utils/ApiError.js";

export const validate = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!parsed.success) {
    console.log("Validation Error:", JSON.stringify(parsed.error.flatten(), null, 2));
    return next(new ApiError(400, "Validation failed", parsed.error.flatten()));
  }

  req.validated = parsed.data;
  return next();
};
