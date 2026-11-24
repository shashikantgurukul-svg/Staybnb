require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../../shared/auth");
const { createServiceApp, startService } = require("../../shared/service");

const bookingSchema = new mongoose.Schema(
  {
    listingId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guestCount: { type: Number, required: true, min: 1 },
    roomCount: { type: Number, required: true, min: 1, default: 1 },
    nightlyRate: { type: Number, min: 0, default: null },
    totalPrice: { type: Number, required: true, min: 0 },
    originalCheckOut: { type: Date, default: null },
    originalTotalPrice: { type: Number, default: null, min: 0 },
    earlyCheckoutAt: { type: Date, default: null },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending", index: true },
  },
  { timestamps: true },
);
bookingSchema.index({ listingId: 1, checkIn: 1, checkOut: 1, status: 1 });
const Booking = mongoose.model("Booking", bookingSchema);
const router = express.Router();

async function getAvailableRooms(listingId, start, end, totalRooms) {
  const [reservationTotals] = await Booking.aggregate([
    {
      $match: {
        listingId: new mongoose.Types.ObjectId(listingId),
        status: { $in: ["pending", "confirmed"] },
        checkIn: { $lt: end },
        checkOut: { $gt: start },
      },
    },
    {
      $group: {
        _id: null,
        bookedRooms: { $sum: { $ifNull: ["$roomCount", 1] } },
      },
    },
  ]);
  return Math.max(0, totalRooms - (reservationTotals?.bookedRooms || 0));
}

router.get("/availability", async (req, res, next) => {
  try {
    const { listingId } = req.query;
    const start = new Date(String(req.query.checkIn || ""));
    const end = new Date(String(req.query.checkOut || ""));
    if (!mongoose.isValidObjectId(listingId) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      return res.status(400).json({ error: "A valid listingId and check-in/check-out times are required" });
    }

    const response = await fetch(`${process.env.LISTINGS_URL || "http://127.0.0.1:4002"}/api/listings/${listingId}`);
    if (!response.ok) return res.status(response.status).json({ error: "Listing is unavailable" });
    const listing = await response.json();
    const withinWindow = (!listing.availableFrom || start >= new Date(listing.availableFrom))
      && (!listing.availableUntil || end <= new Date(listing.availableUntil));
    const availableRooms = withinWindow
      ? await getAvailableRooms(listingId, start, end, Number(listing.roomCount || 1))
      : 0;
    return res.json({
      totalRooms: Number(listing.roomCount || 1),
      availableRooms,
      withinWindow,
    });
  } catch (error) {
    return next(error);
  }
});

router.use(requireAuth);

router.post("/", async (req, res, next) => {
  try {
    const { listingId, checkIn, checkOut, guestCount } = req.body;
    const requestedRooms = Number(req.body.roomCount || 1);
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    if (!mongoose.isValidObjectId(listingId) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      return res.status(400).json({ error: "A valid listingId and a check-out date after check-in are required" });
    }
    if (!Number.isInteger(requestedRooms) || requestedRooms < 1) {
      return res.status(400).json({ error: "roomCount must be a positive whole number" });
    }
    const listingResponse = await fetch(`${process.env.LISTINGS_URL || "http://127.0.0.1:4002"}/api/listings/${listingId}`);
    if (!listingResponse.ok) return res.status(listingResponse.status).json({ error: "Listing is unavailable" });
    const listing = await listingResponse.json();
    if (Number(guestCount) < 1 || Number(guestCount) > listing.maxGuests) {
      return res.status(400).json({ error: "guestCount exceeds listing capacity" });
    }
    if ((listing.availableFrom && start < new Date(listing.availableFrom))
      || (listing.availableUntil && end > new Date(listing.availableUntil))) {
      return res.status(400).json({
        error: "The requested stay is outside the host's available date range",
      });
    }
    const availableRooms = await getAvailableRooms(listingId, start, end, Number(listing.roomCount || 1));
    if (requestedRooms > availableRooms) {
      return res.status(409).json({
        error: availableRooms
          ? `Only ${availableRooms} room(s) are available for those dates`
          : "No rooms are available for those dates",
        availableRooms,
      });
    }

    const nights = Math.ceil((end - start) / 86_400_000);
    const booking = await Booking.create({
      listingId,
      guestId: req.user.sub,
      hostId: listing.hostId,
      checkIn: start,
      checkOut: end,
      guestCount: Number(guestCount),
      roomCount: requestedRooms,
      nightlyRate: listing.pricePerNight,
      totalPrice: nights * listing.pricePerNight * requestedRooms,
    });
    return res.status(201).json(booking);
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    return res.json(await Booking.find({
      $or: [{ guestId: req.user.sub }, { hostId: req.user.sub }],
    }).sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.guestId.toString() !== req.user.sub && booking.hostId.toString() !== req.user.sub) {
      return res.status(403).json({ error: "You are not a participant in this booking" });
    }
    return res.json(booking);
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/early-checkout", async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.guestId.toString() !== req.user.sub || booking.status === "cancelled") {
      return res.status(403).json({ error: "Only the guest can shorten an active booking" });
    }

    const newCheckOut = new Date(req.body.checkOut);
    if (!Number.isFinite(newCheckOut.getTime())
      || newCheckOut <= booking.checkIn
      || newCheckOut >= booking.checkOut) {
      return res.status(400).json({ error: "The new checkout must be after check-in and earlier than the current checkout" });
    }

    const originalCheckOut = booking.originalCheckOut || booking.checkOut;
    const originalTotalPrice = booking.originalTotalPrice ?? booking.totalPrice;
    const nights = Math.ceil((newCheckOut - booking.checkIn) / 86_400_000);
    const originalNights = Math.ceil((originalCheckOut - booking.checkIn) / 86_400_000);

    booking.originalCheckOut = originalCheckOut;
    booking.originalTotalPrice = originalTotalPrice;
    booking.earlyCheckoutAt = new Date();
    booking.checkOut = newCheckOut;
    booking.nightlyRate = booking.nightlyRate ?? originalTotalPrice / (originalNights * booking.roomCount);
    booking.totalPrice = nights * booking.nightlyRate * booking.roomCount;
    await booking.save();
    return res.json(booking);
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const { status } = req.body;
    const isGuest = booking.guestId.toString() === req.user.sub;
    const isHost = booking.hostId.toString() === req.user.sub;
    const allowed = (status === "cancelled" && (isGuest || isHost))
      || (status === "confirmed" && isHost && booking.status === "pending");
    if (!allowed) return res.status(403).json({ error: "You cannot make that booking status change" });
    booking.status = status;
    await booking.save();
    return res.json(booking);
  } catch (error) {
    return next(error);
  }
});

startService("bookings", createServiceApp("bookings", router)).catch((error) => {
  console.error("[bookings] startup failed", error);
  process.exitCode = 1;
});
