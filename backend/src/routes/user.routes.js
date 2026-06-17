import { Router } from "express";
import { z } from "zod";
import * as userController from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const pushTokenSchema = z.object({
  body: z.object({
    pushToken: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.post("/push-token", validate(pushTokenSchema), userController.registerPushToken);

export default router;
