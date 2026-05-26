import { asyncHandler } from "../utils/asyncHandler.js";
import * as cashSessionService from "../services/cashSession.service.js";

export const openSession = asyncHandler(async (req, res) => {
  const session = await cashSessionService.openSession(req.user, req.validated.body);
  res.status(201).json({ success: true, data: session });
});

export const getCurrentSession = asyncHandler(async (req, res) => {
  const session = await cashSessionService.getCurrentSession(req.user, req.validated.query);
  res.json({ success: true, data: session });
});

export const closeSession = asyncHandler(async (req, res) => {
  const session = await cashSessionService.closeSession(
    req.user,
    req.validated.params.id,
    req.validated.body,
  );
  res.json({ success: true, data: session });
});

export const reviewSession = asyncHandler(async (req, res) => {
  const session = await cashSessionService.reviewSession(req.user, req.validated.params.id);
  res.json({ success: true, data: session });
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await cashSessionService.listSessions(req.user, req.validated.query);
  res.json({ success: true, data: sessions });
});
