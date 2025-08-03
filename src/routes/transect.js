// src/routes/transect.js
import express from "express";
const router = express.Router();

import { processTransectsHandler } from "../controllers/transectController.js";

router.post("/process-transects", processTransectsHandler);

export default router;
