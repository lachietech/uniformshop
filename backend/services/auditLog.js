import AuditLog from "../models/AuditLog.js";

export async function logAuditEvent({
  action,
  actorUserId = null,
  actorUsername = "system",
  targetUserId = null,
  targetUsername = null,
  details = {},
  ipAddress = null,
  userAgent = null
}) {
  try {
    await AuditLog.create({
      action,
      actorUserId,
      actorUsername,
      targetUserId,
      targetUsername,
      details,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error("Unable to write audit log:", error.message);
  }
}