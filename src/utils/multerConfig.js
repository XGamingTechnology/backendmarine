// src/utils/multerConfig.js
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, "../uploads");

// ✅ Buat folder uploads jika belum ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log("✅ Folder uploads dibuat:", UPLOAD_DIR);
}

// ✅ Storage untuk CSV & Excel
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

// ✅ Filter file: hanya CSV, Excel, ZIP
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  const allowedTypes = [".csv", ".xlsx", ".xls", ".zip"];

  const allowedMimes = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

  if (allowedTypes.includes(ext) || allowedMimes.some((m) => mime.includes(m))) {
    cb(null, true);
  } else {
    cb(new Error(`Format ${ext} tidak didukung. Harus CSV, Excel, atau ZIP.`), false);
  }
};

// ✅ Limit: 25MB
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

export default upload;
