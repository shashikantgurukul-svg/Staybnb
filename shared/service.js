const express = require("express");
const mongoose = require("mongoose");

function createServiceApp(serviceName, router) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => {
    res.json({
      service: serviceName,
      status: mongoose.connection.readyState === 1 ? "ok" : "starting",
    });
  });
  app.get(`/api/${serviceName}/health`, (_req, res) => {
    res.json({
      service: serviceName,
      status: mongoose.connection.readyState === 1 ? "ok" : "starting",
    });
  });
  app.use(`/api/${serviceName}`, router);
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });
  app.use((error, _req, res, _next) => {
    if (error.code === 11000) {
      return res.status(409).json({ error: "A record with that value already exists" });
    }
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ error: error.message });
    }
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    console.error(`[${serviceName}]`, error);
    return res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

async function startService(serviceName, app) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set");
  }
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  await mongoose.connect(mongoUri, { dbName: `airbnb_${serviceName}` });
  const port = Number(process.env.PORT || 4000);
  app.listen(port, "0.0.0.0", () => {
    console.log(`${serviceName} listening on port ${port}`);
  });
}

module.exports = { createServiceApp, startService };
