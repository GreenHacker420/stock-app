import { asyncHandler } from "../utils/asyncHandler.js";
import { whatsappOnboardingService } from "../services/whatsapp.onboarding.service.js";

export const createSession = asyncHandler(async (req, res) => {
  const result = await whatsappOnboardingService.createSession({
    shopId: req.validated.body.shopId,
    initiatedById: req.user.id,
    mode: req.validated.body.mode,
  });
  res.status(201).json({ success: true, data: result });
});

export const getSession = asyncHandler(async (req, res) => {
  const session = await whatsappOnboardingService.getOwnedSession(
    req.validated.params.sessionId,
    req.validated.query.shopId,
    req.user.id,
  );
  res.json({ success: true, data: whatsappOnboardingService.serialize(session) });
});

export const continueSession = asyncHandler(async (req, res) => {
  const owned = await whatsappOnboardingService.getOwnedSession(
    req.validated.params.sessionId,
    req.validated.body.shopId,
    req.user.id,
  );
  const session = await whatsappOnboardingService.continueSession(owned.id);
  res.json({ success: true, data: whatsappOnboardingService.serialize(session) });
});

export const launchSession = asyncHandler(async (req, res) => {
  const session = await whatsappOnboardingService.getPublicSession(
    req.params.sessionId,
    req.query.state,
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net; connect-src 'self' https://graph.facebook.com https://www.facebook.com; frame-src https://www.facebook.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.type("html").send(whatsappOnboardingService.renderLaunchPage(session, req.query.state));
});

export const completeSession = asyncHandler(async (req, res) => {
  try {
    const session = await whatsappOnboardingService.completePublicSession(
      req.params.sessionId,
      req.body,
    );
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message, details: null });
  }
});
