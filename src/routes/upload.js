// src/routes/upload.js
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth.js";
import { importEchosounderCSV } from "../controllers/uploadController.js"; // ✅ Named import

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- Route: Upload CSV Echosounder ---
router.post(
  "/echosounder",
  authenticate,
  upload.single("file"),
  importEchosounderCSV // ✅ Gunakan named export
);

export default router;
