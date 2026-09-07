import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/auth.service.js";

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated.body);
  res.json({ success: true, data: result });
});

export const logout = asyncHandler(async (req, res) => {
  const installationId = req.body?.installationId;
  if (req.user?.id) {
    await authService.logoutUser(req.user.id, installationId);
  }
  res.json({ success: true, data: { loggedOut: true } });
});

export const refresh = asyncHandler(async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.body?.token;
  const result = await authService.refreshTokenWithGrace(token);
  res.json({ success: true, data: result });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: authService.getCurrentUser(req.user) });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateMe(req.user, req.validated.body);
  res.json({ success: true, data: user });
});

export const listStaff = asyncHandler(async (req, res) => {
  const staff = await authService.listStaff(req.user);
  res.json({ success: true, data: staff });
});

export const createStaff = asyncHandler(async (req, res) => {
  const staff = await authService.createStaff(req.user, req.validated.body);
  res.status(201).json({ success: true, data: staff });
});

export const updateStaff = asyncHandler(async (req, res) => {
  const staff = await authService.updateStaff(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: staff });
});

export const deleteStaff = asyncHandler(async (req, res) => {
  const staff = await authService.deleteStaff(req.user, req.validated.params.id);
  res.json({ success: true, data: staff });
});

export const truecallerLogin = asyncHandler(async (req, res) => {
  const result = await authService.truecallerLogin(req.validated.body);
  res.json({ success: true, data: result });
});

export const truecallerOtpLogin = asyncHandler(async (req, res) => {
  const result = await authService.truecallerOtpLogin(req.validated.body);
  res.json({ success: true, data: result });
});
