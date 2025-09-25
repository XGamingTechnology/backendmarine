// src/routes/contours.js
import express from "express";
import { generateContours } from "../controllers/contourController.js";

const router = express.Router();

router.post("/generate", generateContours);

export default router;
