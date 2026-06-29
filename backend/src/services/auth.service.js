import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { OWNER_PERMISSIONS, STAFF_PERMISSIONS } from "../utils/permissions.js";

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}

export function refreshToken(user) {
  return {
    token: jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    ),
    user,
  };
}

export async function login({ identifier, password }) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ mobile: identifier }, { email: identifier }],
    },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new ApiError(401, "Invalid login credentials");
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new ApiError(401, "Invalid login credentials");
  }

  const token = signToken(user);
  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      permissions,
    },
  };
}

export function getCurrentUser(user) {
  return user;
}

export async function updateMe(currentUser, data) {
  const update = {};
  if (data.name) update.name = data.name;
  if (data.email !== undefined) update.email = data.email;
  if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: update,
  });

  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    permissions,
  };
}

export async function listStaff(currentUser) {
  return prisma.user.findMany({
    where: {
      role: "STAFF",
      staffOwnerId: currentUser.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function createStaff(currentUser, data) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: data.mobile },
        data.email ? { email: data.email } : undefined
      ].filter(Boolean),
    },
  });
  if (existing) {
    throw new ApiError(400, "A user with this mobile or email already exists");
  }

  const passwordHash = await bcrypt.hash(data.password || "staff123", 10);

  const staff = await prisma.user.create({
    data: {
      name: data.name,
      mobile: data.mobile,
      email: data.email,
      passwordHash,
      role: "STAFF",
      status: "ACTIVE",
      staffOwnerId: currentUser.id,
    },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
    },
  });

  return staff;
}

export async function updateStaff(currentUser, staffId, data) {
  const existing = await prisma.user.findUnique({ where: { id: staffId } });
  if (!existing || existing.role !== "STAFF" || existing.staffOwnerId !== currentUser.id) {
    throw new ApiError(404, "Staff not found");
  }

  if (data.email) {
    const emailConflict = await prisma.user.findFirst({
      where: {
        email: data.email,
        id: { not: staffId },
      },
    });
    if (emailConflict) {
      throw new ApiError(400, "A user with this email already exists");
    }
  }

  if (data.mobile) {
    const mobileConflict = await prisma.user.findFirst({
      where: {
        mobile: data.mobile,
        id: { not: staffId },
      },
    });
    if (mobileConflict) {
      throw new ApiError(400, "A user with this mobile already exists");
    }
  }

  const update = {};
  if (data.name) update.name = data.name;
  if (data.mobile) update.mobile = data.mobile;
  if (data.email !== undefined) update.email = data.email;
  if (data.status) update.status = data.status;
  if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

  return prisma.user.update({
    where: { id: staffId },
    data: update,
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      status: true,
    },
  });
}

export async function truecallerLogin({ authorizationCode, codeVerifier }) {
  const clientId = process.env.TRUECALLER_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(500, "Truecaller Client ID is not configured on the server");
  }

  // 1. Exchange authorization code for token
  const tokenResponse = await fetch("https://oauth-account-noneu.truecaller.com/v1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: authorizationCode,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Truecaller token exchange failed:", errorText);
    throw new ApiError(401, "Truecaller authentication failed during token exchange");
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new ApiError(401, "No access token received from Truecaller");
  }

  // 2. Fetch user profile
  const profileResponse = await fetch("https://oauth-account-noneu.truecaller.com/v1/userinfo", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!profileResponse.ok) {
    const errorText = await profileResponse.text();
    console.error("Truecaller userinfo fetch failed:", errorText);
    throw new ApiError(401, "Truecaller authentication failed during user profile fetch");
  }

  const profileData = await profileResponse.json();
  const phone = profileData.phone_number;

  if (!phone) {
    throw new ApiError(400, "Truecaller response did not contain a phone number");
  }

  // Extract last 10 digits to match database formats (e.g. 91xxxxxxxxxx vs xxxxxxxxxx)
  const cleanPhone = phone.slice(-10);

  // 3. Find matching active user in DB
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: phone },
        { mobile: { endsWith: cleanPhone } }
      ],
      status: "ACTIVE",
    },
  });

  if (!user) {
    throw new ApiError(401, `Mobile number ${phone} is not registered in ShopControl`);
  }

  // 4. Sign session token
  const token = signToken(user);
  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      permissions,
    },
  };
}

export async function truecallerOtpLogin({ accessToken }) {
  const clientId = process.env.TRUECALLER_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(500, "Truecaller Client ID is not configured on the server");
  }

  // 1. Validate token with Truecaller server
  const response = await fetch(
    `https://sdk-otp-verification-noneu.truecaller.com/v1/otp/client/installation/phoneNumberDetail/${accessToken}`,
    {
      method: "GET",
      headers: {
        clientId: clientId,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Truecaller OTP validation failed:", errorText);
    throw new ApiError(401, "Truecaller OTP validation failed");
  }

  const profileData = await response.json();
  const phoneVal = profileData.phoneNumber || profileData.phone_number;
  if (!phoneVal) {
    throw new ApiError(400, "Truecaller response did not contain a phone number");
  }

  const phoneStr = String(phoneVal);
  const cleanPhone = phoneStr.slice(-10);

  // 2. Find matching active user in DB
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: phoneStr },
        { mobile: { endsWith: cleanPhone } }
      ],
      status: "ACTIVE",
    },
  });

  if (!user) {
    throw new ApiError(401, `Mobile number ${phoneStr} is not registered in ShopControl`);
  }

  // 3. Sign session token
  const token = signToken(user);
  const permissions = user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS;

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      permissions,
    },
  };
}
