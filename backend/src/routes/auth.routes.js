import { Router } from "express";
import { z } from "zod";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";

import { requireOwner } from "../middleware/rbac.middleware.js";

const router = Router();

const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1),
    password: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const createStaffSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    mobile: z.string().min(10),
    email: z.email().optional().nullable(),
    password: z.string().min(4).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const updateMeSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.email().nullable().optional(),
    password: z.string().min(4).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const updateStaffSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().min(1).optional(),
    mobile: z.string().min(10).optional(),
    email: z.email().nullable().optional(),
    password: z.string().min(4).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
  query: z.object({}).optional(),
});

const truecallerSchema = z.object({
  body: z.object({
    authorizationCode: z.string().min(1),
    codeVerifier: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const truecallerOtpSchema = z.object({
  body: z.object({
    accessToken: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

router.post("/login", validate(loginSchema), authController.login);
router.post("/truecaller", validate(truecallerSchema), authController.truecallerLogin);
router.post("/truecaller-otp", validate(truecallerOtpSchema), authController.truecallerOtpLogin);
router.post("/logout", requireAuth, authController.logout);
router.post("/refresh", requireAuth, authController.refresh);
router.get("/me", requireAuth, authController.me);
router.patch("/me", requireAuth, validate(updateMeSchema), authController.updateMe);
router.get("/staff", requireAuth, requireOwner, authController.listStaff);
router.post("/staff", requireAuth, requireOwner, validate(createStaffSchema), authController.createStaff);
router.patch("/staff/:id", requireAuth, requireOwner, validate(updateStaffSchema), authController.updateStaff);

export default router;
