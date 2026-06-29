import { asyncHandler } from "../utils/asyncHandler.js";
import * as cashSessionService from "../services/cashSession.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const openSession = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /cash-sessions/open",
      resourceType: "CASH_SESSION",
      shopId: req.validated.body.shopId,
    },
    () => cashSessionService.openSession(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const getCurrentSession = asyncHandler(async (req, res) => {
  const session = await cashSessionService.getCurrentSession(req.user, req.validated.query);
  res.json({ success: true, data: session });
});

export const closeSession = asyncHandler(async (req, res) => {
  const sessionId = req.validated.params.id;
  const shopId = await cashSessionService.getSessionShopForAction(req.user, sessionId);
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: `POST /cash-sessions/${sessionId}/close`,
      resourceType: "CASH_SESSION_CLOSE",
      shopId,
      statusCode: 200,
    },
    () => cashSessionService.closeSession(
      req.user,
      sessionId,
      req.validated.body,
    ),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const reviewSession = asyncHandler(async (req, res) => {
  const session = await cashSessionService.reviewSession(req.user, req.validated.params.id);
  res.json({ success: true, data: session });
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await cashSessionService.listSessions(req.user, req.validated.query);
  res.json({ success: true, data: sessions });
});
