import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/auth.service.js";

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body);
  res.json({ success: true, data: result });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: authService.getCurrentUser(req.user) });
});
