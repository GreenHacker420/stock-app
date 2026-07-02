import { asyncHandler } from "../utils/asyncHandler.js";
import * as attendanceService from "../services/attendance.service.js";

export const checkIn = asyncHandler(async (req, res) => {
  const { shopId, note, staffId } = req.validated.body;
  const attendance = await attendanceService.checkIn(req.user, { shopId, note, staffId });
  res.status(201).json({ success: true, data: attendance });
});

export const checkOut = asyncHandler(async (req, res) => {
  const { shopId, note, staffId } = req.validated.body;
  const attendance = await attendanceService.checkOut(req.user, { shopId, note, staffId });
  res.json({ success: true, data: attendance });
});

export const listAttendance = asyncHandler(async (req, res) => {
  const { shopId, staffId, dateFrom, dateTo } = req.validated.query;
  
  // If the user is STAFF, restrict them to viewing only their own attendance
  let targetStaffId = staffId;
  if (req.user.role === "STAFF") {
    targetStaffId = req.user.id;
  }

  const logs = await attendanceService.listAttendance(req.user, {
    shopId,
    staffId: targetStaffId,
    dateFrom,
    dateTo,
  });
  
  res.json({ success: true, data: logs });
});

export const requestLeave = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason } = req.validated.body;
  const leave = await attendanceService.requestLeave(req.user, { startDate, endDate, reason });
  res.status(201).json({ success: true, data: leave });
});

export const respondToLeave = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  const { status } = req.validated.body;
  const leave = await attendanceService.respondToLeave(req.user, id, { status });
  res.json({ success: true, data: leave });
});
