import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    actorUsername: {
      type: String,
      default: "system",
      trim: true,
      maxlength: 64
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    targetUsername: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: null,
      trim: true,
      maxlength: 128
    },
    userAgent: {
      type: String,
      default: null,
      trim: true,
      maxlength: 400
    }
  },
  { timestamps: true }
);

export default mongoose.model("AuditLog", auditLogSchema);