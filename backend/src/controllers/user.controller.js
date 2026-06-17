import { asyncHandler } from "../utils/asyncHandler.js";
import prisma from "../lib/db.js";

export const registerPushToken = asyncHandler(async (req, res) => {
  const { pushToken } = req.validated.body;
  const userId = req.user.id;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { pushToken },
  });

  res.json({
    success: true,
    data: {
      pushToken: user.pushToken,
    },
  });
});
