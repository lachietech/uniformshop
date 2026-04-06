import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { logAuditEvent } from "../services/auditLog.js";
import {
  clearAuthCookie,
  createAuthToken,
  requireAdmin,
  requireAuth,
  setAuthCookie
} from "../middleware/auth.js";

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

const MIN_PASSWORD_LENGTH = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include upper case, lower case, and a number";
  }
  return null;
}

function validateUsername(username) {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return "Username must be 3-32 characters and use only letters, numbers, dots, underscores, or hyphens";
  }
  return null;
}

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    active: user.active,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}

function getRequestMeta(req) {
  return {
    ipAddress: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
    userAgent: req.get("user-agent") || null
  };
}

router.get("/setup-status", async (req, res) => {
  const userCount = await User.countDocuments();
  res.json({ needsSetup: userCount === 0 });
});

router.post("/setup", async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return res.status(409).json({ error: "Initial setup has already been completed" });
    }

    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      passwordHash,
      role: "admin",
      active: true,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      lastLoginAt: new Date()
    });

    await logAuditEvent({
      action: "auth.setup.completed",
      actorUserId: user._id,
      actorUsername: user.username,
      targetUserId: user._id,
      targetUsername: user.username,
      details: { role: user.role },
      ...getRequestMeta(req)
    });

    const token = createAuthToken(user);
    setAuthCookie(res, token);
    return res.status(201).json({ ok: true, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to complete initial setup" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      await logAuditEvent({
        action: "auth.login.failed",
        actorUsername: username || "unknown",
        targetUsername: username || null,
        details: { reason: "unknown_username" },
        ...getRequestMeta(req)
      });
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (!user.active) {
      await logAuditEvent({
        action: "auth.login.blocked",
        actorUserId: user._id,
        actorUsername: user.username,
        targetUserId: user._id,
        targetUsername: user.username,
        details: { reason: "inactive_account" },
        ...getRequestMeta(req)
      });
      return res.status(403).json({ error: "This account is inactive. Contact an administrator." });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      await logAuditEvent({
        action: "auth.login.blocked",
        actorUserId: user._id,
        actorUsername: user.username,
        targetUserId: user._id,
        targetUsername: user.username,
        details: { reason: "temporary_lock", lockUntil: user.lockUntil },
        ...getRequestMeta(req)
      });
      return res.status(423).json({ error: "Account temporarily locked. Please try again later." });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;
      if (user.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.failedLoginCount = 0;
      }
      await user.save();
      await logAuditEvent({
        action: "auth.login.failed",
        actorUserId: user._id,
        actorUsername: user.username,
        targetUserId: user._id,
        targetUsername: user.username,
        details: { reason: user.lockUntil ? "bad_password_locked" : "bad_password", lockUntil: user.lockUntil },
        ...getRequestMeta(req)
      });
      return res.status(401).json({ error: "Invalid username or password" });
    }

    user.failedLoginCount = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    await logAuditEvent({
      action: "auth.login.succeeded",
      actorUserId: user._id,
      actorUsername: user.username,
      targetUserId: user._id,
      targetUsername: user.username,
      details: { mustChangePassword: user.mustChangePassword },
      ...getRequestMeta(req)
    });

    const token = createAuthToken(user);
    setAuthCookie(res, token);
    return res.json({ ok: true, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to complete sign in" });
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  await logAuditEvent({
    action: "auth.logout",
    actorUserId: req.user.id,
    actorUsername: req.user.username,
    targetUserId: req.user.id,
    targetUsername: req.user.username,
    ...getRequestMeta(req)
  });
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("username role active mustChangePassword");
  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Session is no longer valid" });
  }
  if (!user.active) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Account is inactive" });
  }
  return res.json({ user: sanitizeUser(user) });
});

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find().select("username role active createdAt lastLoginAt lockUntil mustChangePassword").sort({ username: 1 });
  res.json(users.map((user) => ({
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    lockUntil: user.lockUntil,
    mustChangePassword: Boolean(user.mustChangePassword)
  })));
});

router.get("/audit-logs", requireAuth, requireAdmin, async (req, res) => {
  const auditLogs = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .select("action actorUsername targetUsername details createdAt ipAddress");

  res.json(auditLogs.map((entry) => ({
    id: entry._id.toString(),
    action: entry.action,
    actorUsername: entry.actorUsername,
    targetUsername: entry.targetUsername,
    details: entry.details || {},
    ipAddress: entry.ipAddress,
    createdAt: entry.createdAt
  })));
});

router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = req.body?.role === "admin" ? "admin" : "staff";

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      passwordHash,
      role,
      active: true,
      mustChangePassword: role === "staff",
      passwordChangedAt: role === "staff" ? null : new Date()
    });

    await logAuditEvent({
      action: "auth.user.created",
      actorUserId: req.user.id,
      actorUsername: req.user.username,
      targetUserId: user._id,
      targetUsername: user.username,
      details: { role: user.role, mustChangePassword: user.mustChangePassword },
      ...getRequestMeta(req)
    });

    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to create user" });
  }
});

router.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const username = String(req.body?.username || targetUser.username).trim().toLowerCase();
    const role = req.body?.role === "admin" ? "admin" : "staff";
    const active = req.body?.active !== false;
    const newPassword = String(req.body?.password || "");

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }

    const existingUser = await User.findOne({ username, _id: { $ne: targetUser._id } });
    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    if (!active && req.user.id === targetUser._id.toString()) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }

    if (targetUser.role === "admin" && role !== "admin") {
      const adminCount = await User.countDocuments({ role: "admin", active: true, _id: { $ne: targetUser._id } });
      if (adminCount === 0) {
        return res.status(400).json({ error: "At least one active admin account is required" });
      }
    }

    if (targetUser.role === "admin" && !active) {
      const adminCount = await User.countDocuments({ role: "admin", active: true, _id: { $ne: targetUser._id } });
      if (adminCount === 0) {
        return res.status(400).json({ error: "At least one active admin account is required" });
      }
    }

    targetUser.username = username;
    targetUser.role = role;
    targetUser.active = active;

    if (newPassword) {
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
      targetUser.passwordHash = await bcrypt.hash(newPassword, 12);
      targetUser.failedLoginCount = 0;
      targetUser.lockUntil = null;
      targetUser.mustChangePassword = req.user.id !== targetUser._id.toString();
      targetUser.passwordChangedAt = req.user.id === targetUser._id.toString() ? new Date() : null;
    }

    await targetUser.save();
    await logAuditEvent({
      action: "auth.user.updated",
      actorUserId: req.user.id,
      actorUsername: req.user.username,
      targetUserId: targetUser._id,
      targetUsername: targetUser.username,
      details: {
        role: targetUser.role,
        active: targetUser.active,
        passwordReset: Boolean(newPassword),
        mustChangePassword: targetUser.mustChangePassword
      },
      ...getRequestMeta(req)
    });
    return res.json({ user: sanitizeUser(targetUser) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to update user" });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Current password, new password, and confirmation are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.active) {
      clearAuthCookie(res);
      return res.status(401).json({ error: "Session is no longer valid" });
    }

    const currentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentPasswordValid) {
      await logAuditEvent({
        action: "auth.password.change_failed",
        actorUserId: user._id,
        actorUsername: user.username,
        targetUserId: user._id,
        targetUsername: user.username,
        details: { reason: "incorrect_current_password" },
        ...getRequestMeta(req)
      });
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (samePassword) {
      return res.status(400).json({ error: "New password must be different from the current password" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.failedLoginCount = 0;
    user.lockUntil = null;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    await logAuditEvent({
      action: "auth.password.changed",
      actorUserId: user._id,
      actorUsername: user.username,
      targetUserId: user._id,
      targetUsername: user.username,
      details: { clearedPasswordResetRequirement: true },
      ...getRequestMeta(req)
    });

    const token = createAuthToken(user);
    setAuthCookie(res, token);
    return res.json({ ok: true, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: "Unable to change password" });
  }
});

export default router;