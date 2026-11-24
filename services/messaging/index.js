require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../../shared/auth");
const { createServiceApp, startService } = require("../../shared/service");

const conversationSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    participantIds: [{ type: mongoose.Schema.Types.ObjectId, required: true, index: true }],
    messages: [{
      senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
      body: { type: String, required: true, maxlength: 4000 },
      sentAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true },
);
const Conversation = mongoose.model("Conversation", conversationSchema);
const router = express.Router();
router.use(requireAuth);

router.post("/", async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ error: "A valid bookingId is required" });
    }
    const response = await fetch(`${process.env.BOOKINGS_URL || "http://127.0.0.1:4003"}/api/bookings/${bookingId}`, {
      headers: { authorization: req.get("authorization") },
    });
    if (!response.ok) return res.status(response.status).json({ error: "Booking could not be verified" });
    const booking = await response.json();
    const existing = await Conversation.findOne({ bookingId });
    if (existing) return res.json(existing);
    const conversation = await Conversation.create({
      bookingId,
      participantIds: [booking.guestId, booking.hostId],
      messages: [],
    });
    return res.status(201).json(conversation);
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    return res.json(await Conversation.find({ participantIds: req.user.sub }).sort({ updatedAt: -1 }).limit(100));
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/messages", async (req, res, next) => {
  try {
    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Message body is required" });
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participantIds: req.user.sub,
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    conversation.messages.push({ senderId: req.user.sub, body });
    await conversation.save();
    return res.status(201).json(conversation.messages[conversation.messages.length - 1]);
  } catch (error) {
    return next(error);
  }
});

startService("messaging", createServiceApp("messaging", router)).catch((error) => {
  console.error("[messaging] startup failed", error);
  process.exitCode = 1;
});
