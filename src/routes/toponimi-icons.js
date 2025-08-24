// src/routes/toponimi-icons.js
import { Router } from "express";
import { getToponimiIcons } from "../controllers/toponimiController.js";

const router = Router();

router.get("/toponimi-icons", getToponimiIcons);

export default router;
