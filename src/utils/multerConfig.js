// src/utils/multerConfig.js
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uploadDir = path.join(__dirname, "../uploads");

// Buat folder uploads jika belum ada
import fs from "fs";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// Filter hanya file tertentu
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  // Izinkan: .csv, .shp, .xlsx, .zip (untuk SHP)
  if (ext === ".csv" || ext === ".xlsx" || ext === ".xls" || ext === ".zip" || mime === "application/vnd.ms-excel" || mime.includes("spreadsheet") || mime === "text/csv") {
    cb(null, true);
  } else {
    cb(new Error("Tipe file tidak didukung. Harus CSV, Excel, atau ZIP (SHP)"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
  },
});

export default upload;
