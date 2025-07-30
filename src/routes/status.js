// src/routes/status.js
import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "WebGIS Backend",
    timestamp: new Date().toISOString(),
  });
});

// ✅ Tambahkan export default
export default router;
