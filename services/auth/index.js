require("dotenv").config();

const bcrypt = require("bcryptjs");
const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, signToken } = require("../../shared/auth");
const { createServiceApp, startService } = require("../../shared/service");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["guest", "host"], default: "guest" },
  },
  { timestamps: true },
);
const User = mongoose.model("User", userSchema);
const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, role = "guest" } = req.body;
    if (!name || !email || !password || !["guest", "host"].includes(role)) {
      return res.status(400).json({ error: "name, email, password, and a valid role are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must contain at least 8 characters" });
    }
    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role,
    });
    return res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: signToken(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const user = await User.findOne({ email: String(email || "").toLowerCase() }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }
    if (role && ["guest", "host"].includes(role) && user.role !== role) {
      return res.status(403).json({ error: `This account is registered as a ${user.role}, not a ${role}` });
    }
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: signToken(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    return next(error);
  }
});

startService("auth", createServiceApp("auth", router)).catch((error) => {
  console.error("[auth] startup failed", error);
  process.exitCode = 1;
});
