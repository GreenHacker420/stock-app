import { Router } from "express";
import { z } from "zod";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1),
    password: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

router.post("/login", validate(loginSchema), authController.login);
router.get("/me", requireAuth, authController.me);

export default router;
