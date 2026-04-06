import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 32
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "staff"],
      default: "staff"
    },
    active: {
      type: Boolean,
      default: true
    },
    failedLoginCount: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date,
      default: null
    },
    mustChangePassword: {
      type: Boolean,
      default: false
    },
    passwordChangedAt: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
