import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const AUTH_COOKIE_NAME = "uniform_shop_session";

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return process.env.JWT_SECRET;
}

export function createAuthToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      username: user.username,
      role: user.role
    },
    getJwtSecret(),
    { expiresIn: process.env.AUTH_TOKEN_TTL || "12h" }
  );
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12,
    path: "/"
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export async function resolveAuthenticatedUser(req, res = null) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) {
      return null;
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.sub).select("username role active mustChangePassword");
    if (!user || !user.active) {
      if (res) {
        clearAuthCookie(res);
      }
      return null;
    }

    return {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      active: user.active,
      mustChangePassword: user.mustChangePassword
    };
  } catch (error) {
    if (res) {
      clearAuthCookie(res);
    }
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const user = await resolveAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: "Session is no longer valid" });
  }

  req.user = user;
  next();
}

export function requirePasswordChangeResolved(req, res, next) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({
      error: "You must change your password before using the platform",
      code: "PASSWORD_CHANGE_REQUIRED"
    });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Administrator access required" });
  }
  next();
}
