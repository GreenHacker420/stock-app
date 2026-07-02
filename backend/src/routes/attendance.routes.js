import { Router } from "express";
import { z } from "zod";
import * as attendanceController from "../controllers/attendance.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const empty = z.object({}).optional();

const checkInOutSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    note: z.string().optional(),
    staffId: z.string().optional(),
  }),
  params: empty,
  query: empty,
});

const listAttendanceSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    shopId: z.string().optional(),
    staffId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }),
});

const requestLeaveSchema = z.object({
  body: z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    reason: z.string().min(1),
  }),
  params: empty,
  query: empty,
});

const respondLeaveSchema = z.object({
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
  }),
  params: z.object({
    id: z.string().min(1),
  }),
  query: empty,
});

router.use(requireAuth);

router.post("/check-in", validate(checkInOutSchema), attendanceController.checkIn);
router.post("/check-out", validate(checkInOutSchema), attendanceController.checkOut);
router.get("/", validate(listAttendanceSchema), attendanceController.listAttendance);
router.post("/leave", validate(requestLeaveSchema), attendanceController.requestLeave);
router.post("/leave/:id/respond", validate(respondLeaveSchema), attendanceController.respondToLeave);

export default router;
