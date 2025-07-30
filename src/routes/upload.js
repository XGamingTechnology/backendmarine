// src/routes/upload.js
import express from "express";
import uploadController from "../controllers/uploadController.js";
import upload from "../utils/multerConfig.js";

const router = express.Router();

router.post("/shp", upload.single("shapefile"), uploadController.importShp);
router.post("/excel", upload.single("excel"), uploadController.importExcel);

// ✅ Tambahkan export default
export default router;
