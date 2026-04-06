import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

dotenv.config();

const username = process.argv[2] || "admin";
const tempPassword = process.argv[3] || "TempHFSS-2026!Reset1";

if (tempPassword.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);

  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const user = await User.findOneAndUpdate(
    { username: username.toLowerCase() },
    {
      $set: {
        active: true,
        failedLoginCount: 0,
        lockUntil: null,
        mustChangePassword: true,
        passwordHash,
        passwordChangedAt: null
      }
    },
    { returnDocument: "after" }
  );

  if (!user) {
    console.error(`User not found: ${username}`);
    process.exit(1);
  }

  console.log(`Password reset successful for ${user.username}`);
  console.log("mustChangePassword=true and account active=true");
} catch (error) {
  console.error("Failed to reset password:", error.message);
  process.exit(1);
} finally {
  await mongoose.disconnect();
}
