import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/auth.service.js";

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body);
  res.json({ success: true, data: result });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: authService.getCurrentUser(req.user) });
});

export const listStaff = asyncHandler(async (req, res) => {
  const staff = await authService.listStaff(req.user);
  res.json({ success: true, data: staff });
});

export const createStaff = asyncHandler(async (req, res) => {
  const staff = await authService.createStaff(req.user, req.validated.body);
  res.status(201).json({ success: true, data: staff });
});
