require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../../shared/auth");
const { createServiceApp, startService } = require("../../shared/service");

const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: (coordinates) => coordinates.length === 2,
    },
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, required: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true },
);

const listingSchema = new mongoose.Schema(
  {
    hostId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true, index: true },
      country: { type: String, required: true },
    },
    location: { type: geoPointSchema, default: undefined },
    pricePerNight: { type: Number, required: true, min: 1 },
    maxGuests: { type: Number, required: true, min: 1 },
    roomCount: { type: Number, required: true, min: 1, default: 1 },
    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },
    amenities: { type: [String], default: [] },
    images: { type: [String], default: [] },
    reviews: { type: [reviewSchema], default: [] },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
  },
  { timestamps: true },
);
listingSchema.pre("validate", function validateAvailability(next) {
  if (this.availableFrom && this.availableUntil && this.availableUntil < this.availableFrom) {
    this.invalidate("availableUntil", "Availability end date must be on or after the start date");
  }
  next();
});
listingSchema.index({ location: "2dsphere" });
const Listing = mongoose.model("Listing", listingSchema);
const router = express.Router();

router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "host") {
      return res.status(403).json({ error: "Only hosts can view host listings" });
    }
    return res.json(await Listing.find({ hostId: req.user.sub }).sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const query = { status: "active" };
    if (req.query.city) query["address.city"] = new RegExp(String(req.query.city), "i");
    if (req.query.guests) query.maxGuests = { $gte: Number(req.query.guests) };
    if (req.query.checkIn && req.query.checkOut) {
      const checkIn = new Date(String(req.query.checkIn));
      const checkOut = new Date(String(req.query.checkOut));
      if (!Number.isFinite(checkIn.getTime()) || !Number.isFinite(checkOut.getTime()) || checkOut <= checkIn) {
        return res.status(400).json({ error: "Valid check-in and check-out dates are required" });
      }
      query.$and = [
        { $or: [{ availableFrom: null }, { availableFrom: { $exists: false } }, { availableFrom: { $lte: checkIn } }] },
        { $or: [{ availableUntil: null }, { availableUntil: { $exists: false } }, { availableUntil: { $gte: checkOut } }] },
      ];
    }
    if (req.query.minPrice || req.query.maxPrice) {
      query.pricePerNight = {};
      if (req.query.minPrice) query.pricePerNight.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) query.pricePerNight.$lte = Number(req.query.maxPrice);
    }
    return res.json(await Listing.find(query).sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, status: "active" });
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    return res.json(listing);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/reviews", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, status: "active" });
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    const { bookingId, comment = "" } = req.body;
    const rating = Number(req.body.rating);
    if (!mongoose.isValidObjectId(bookingId) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "A valid bookingId and a rating from 1 to 5 are required" });
    }

    const response = await fetch(`${process.env.BOOKINGS_URL || "http://127.0.0.1:4003"}/api/bookings/${bookingId}`, {
      headers: { authorization: req.get("authorization") },
    });
    if (!response.ok) return res.status(response.status).json({ error: "Booking could not be verified" });
    const booking = await response.json();
    if (booking.guestId !== req.user.sub || booking.listingId !== listing.id || booking.status === "cancelled") {
      return res.status(403).json({ error: "Only the guest who completed this stay can review it" });
    }
    if (new Date(booking.checkOut) > new Date()) {
      return res.status(403).json({ error: "You can review this stay after checkout" });
    }
    if (listing.reviews.some((review) => String(review.bookingId) === String(booking._id))) {
      return res.status(409).json({ error: "You have already reviewed this stay" });
    }

    listing.reviews.push({
      bookingId,
      guestId: req.user.sub,
      rating,
      comment: String(comment).trim(),
    });
    await listing.save();
    return res.status(201).json(listing.reviews[listing.reviews.length - 1]);
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "host") {
      return res.status(403).json({ error: "Only hosts can create listings" });
    }
    const { title, description, address, pricePerNight, maxGuests } = req.body;
    if (!title || !description || !address?.street || !address?.city || !address?.country) {
      return res.status(400).json({ error: "title, description, and a complete address are required" });
    }
    const listing = await Listing.create({
      title,
      description,
      address,
      location: req.body.location,
      pricePerNight,
      maxGuests,
      roomCount: req.body.roomCount,
      availableFrom: req.body.availableFrom,
      availableUntil: req.body.availableUntil,
      amenities: req.body.amenities,
      images: req.body.images,
      hostId: req.user.sub,
    });
    return res.status(201).json(listing);
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.hostId) !== req.user.sub) {
      return res.status(403).json({ error: "Only the listing host can update it" });
    }
    const allowed = ["title", "description", "address", "location", "pricePerNight", "maxGuests", "roomCount", "availableFrom", "availableUntil", "amenities", "images", "status"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) listing[key] = req.body[key];
    }
    await listing.save();
    return res.json(listing);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.hostId) !== req.user.sub) {
      return res.status(403).json({ error: "Only the listing host can remove it" });
    }
    await listing.deleteOne();
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

startService("listings", createServiceApp("listings", router)).catch((error) => {
  console.error("[listings] startup failed", error);
  process.exitCode = 1;
});
