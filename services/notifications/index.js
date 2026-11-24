require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../../shared/auth");
const { createServiceApp, startService } = require("../../shared/service");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, required: true, trim: true, maxlength: 50 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 1000 },
    readAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
const Notification = mongoose.model("Notification", notificationSchema);
const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    return res.json(await Notification.find({ userId: req.user.sub }).sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { type, title, body, metadata } = req.body;
    if (!type || !title || !body) {
      return res.status(400).json({ error: "type, title, and body are required" });
    }
    const notification = await Notification.create({
      userId: req.user.sub,
      type,
      title,
      body,
      metadata,
    });
    return res.status(201).json(notification);
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.sub },
      { readAt: new Date() },
      { new: true },
    );
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    return res.json(notification);
  } catch (error) {
    return next(error);
  }
});

startService("notifications", createServiceApp("notifications", router)).catch((error) => {
  console.error("[notifications] startup failed", error);
  process.exitCode = 1;
});
