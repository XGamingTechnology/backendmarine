// src/routes/upload.js
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth.js";
import { importEchosounderCSV } from "../controllers/uploadController.js";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/echosounder", authenticate, upload.single("file"), importEchosounderCSV);

export default router;
