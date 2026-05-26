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

router.post("/login", validate(loginSchema), authController.login);
router.get("/me", requireAuth, authController.me);
router.get("/staff", requireAuth, requireOwner, authController.listStaff);
router.post("/staff", requireAuth, requireOwner, validate(createStaffSchema), authController.createStaff);

export default router;
