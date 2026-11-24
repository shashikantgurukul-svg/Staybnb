require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../../shared/auth");
const { createServiceApp, startService } = require("../../shared/service");

const paymentSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR", uppercase: true },
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    providerPaymentId: { type: String, default: null },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
  },
  { timestamps: true },
);
const Payment = mongoose.model("Payment", paymentSchema);
const router = express.Router();

router.get("/config", (req, res) => {
  return res.json({
    keyId: process.env.RAZORPAY_KEY_ID || "",
    enabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  });
});

router.use(requireAuth);

router.post("/order", async (req, res, next) => {
  try {
    const { paymentId } = req.body;
    const payment = await Payment.findOne({ _id: paymentId, guestId: req.user.sub });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.json({ configured: false });
    }
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: Math.round(payment.amount * 100),
        currency: "INR",
        receipt: payment.id,
      }),
    });
    const order = await response.json();
    if (!response.ok) return res.status(502).json({ error: order.error?.description || "Razorpay order could not be created" });
    return res.json({ configured: true, orderId: order.id });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ error: "A valid bookingId is required" });
    }
    const bookingResponse = await fetch(`${process.env.BOOKINGS_URL || "http://127.0.0.1:4003"}/api/bookings/${bookingId}`, {
      headers: { authorization: req.get("authorization") },
    });
    if (!bookingResponse.ok) return res.status(bookingResponse.status).json({ error: "Booking could not be verified" });
    const booking = await bookingResponse.json();
    if (booking.guestId !== req.user.sub) {
      return res.status(403).json({ error: "Only the booking guest can initiate its payment" });
    }
    const existing = await Payment.findOne({ bookingId });
    if (existing) {
      if (existing.status === "pending" && existing.amount !== booking.totalPrice) {
        existing.amount = booking.totalPrice;
        await existing.save();
      }
      return res.json(existing);
    }
    const payment = await Payment.create({
      bookingId,
      guestId: req.user.sub,
      amount: booking.totalPrice,
    });
    return res.status(201).json(payment);
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/complete", async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, guestId: req.user.sub });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.status === "paid") return res.json(payment);

    const { providerPaymentId, providerOrderId, providerSignature } = req.body;
    if (process.env.RAZORPAY_KEY_SECRET) {
      if (!providerOrderId || !providerPaymentId || !providerSignature) {
        return res.status(400).json({ error: "Razorpay payment verification details are required" });
      }
      const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${providerOrderId}|${providerPaymentId}`)
        .digest("hex");
      if (expected !== providerSignature) {
        payment.status = "failed";
        await payment.save();
        return res.status(400).json({ error: "Razorpay signature verification failed" });
      }
    } else if (!providerPaymentId) {
      return res.status(400).json({ error: "A provider payment reference is required" });
    }

    payment.status = "paid";
    payment.providerPaymentId = providerPaymentId;
    await payment.save();
    return res.json(payment);
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    return res.json(await Payment.find({ guestId: req.user.sub }).sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, guestId: req.user.sub });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    return res.json(payment);
  } catch (error) {
    return next(error);
  }
});

startService("payments", createServiceApp("payments", router)).catch((error) => {
  console.error("[payments] startup failed", error);
  process.exitCode = 1;
});
