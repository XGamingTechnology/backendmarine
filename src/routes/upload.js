// src/routes/upload.js
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth.js";
import { importEchosounderCSV } from "../controllers/uploadController.js";

const router = express.Router();

// ✅ Gunakan memoryStorage untuk buffer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Route: Upload CSV Echosounder ---
router.post(
  "/echosounder",
  authenticate,
  upload.single("file"), // ← multer parse multipart
  importEchosounderCSV
);

export default router;
