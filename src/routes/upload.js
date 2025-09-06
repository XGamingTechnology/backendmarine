// src/routes/upload.js
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { authenticate } from "../middleware/auth.js";
import { importEchosounderCSV } from "../controllers/uploadController.js";
import client from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 Setup folder upload
const ICONS_DIR = path.join(__dirname, "../../public/icons/custom");
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  console.log("✅ Folder custom icons dibuat:", ICONS_DIR);
}

// ✅ Multer: untuk upload CSV (di memori)
const uploadToMemory = multer({ storage: multer.memoryStorage() });

// ✅ Multer: untuk upload icon (ke disk)
const uploadToDisk = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, ICONS_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${req.user.id}_custom_${Date.now()}${ext}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".png", ".svg", ".jpg", ".jpeg"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Format file tidak didukung. Harus PNG, SVG, JPG, atau JPEG."));
    }
  },
});

const router = express.Router();

// 🔹 Route: Upload CSV Echosounder
router.post("/echosounder", authenticate, uploadToMemory.single("file"), importEchosounderCSV);

// 🔹 Route: Upload Custom Icon
router.post("/icon", authenticate, uploadToDisk.single("file"), async (req, res) => {
  try {
    const { user } = req;
    const { name = "Custom Icon", category_slug = "custom" } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "File tidak ditemukan" });
    }

    const { filename } = req.file;

    // ✅ 1. Validasi: pastikan kategori dengan slug ada
    const categoryCheck = await client.query("SELECT id, name FROM toponimi_categories WHERE slug = $1 AND is_active = true", [category_slug]);

    if (categoryCheck.rows.length === 0) {
      return res.status(400).json({
        error: `Kategori dengan slug '${category_slug}' tidak ditemukan. Pastikan kategori sudah dibuat di database.`,
      });
    }

    const categoryId = categoryCheck.rows[0].id;

    // ✅ 2. Buat slug yang aman (tanpa ekstensi, unik, tidak sama dengan filename)
    const baseSlug = `${user.id}_custom_icon_${Date.now()}`;

    // ✅ 3. Simpan metadata ke toponimi_icons
    const result = await client.query(
      `INSERT INTO toponimi_icons (filename, slug, name, category_id, user_id, is_custom, is_active)
       VALUES ($1, $2, $3, $4, $5, true, true)
       RETURNING id, filename, slug, name, $6 AS category_slug, $7 AS category_name, is_custom`,
      [
        filename,
        baseSlug, // ✅ slug tidak sama dengan filename
        name,
        categoryId,
        user.id,
        category_slug,
        categoryCheck.rows[0].name,
      ]
    );

    // ✅ 4. Kembalikan URL lengkap dari backend
    return res.json({
      success: true,
      icon: {
        ...result.rows[0],
        url: `http://localhost:5000/icons/custom/${result.rows[0].filename}`, // ✅ full URL
      },
    });
  } catch (err) {
    console.error("❌ Gagal simpan metadata icon:", err);

    // ✅ Handle error spesifik PostgreSQL
    if (err.code === "42703") {
      return res.status(500).json({
        error: "Kolom tidak ditemukan di database. Pastikan struktur tabel toponimi_icons dan toponimi_categories benar.",
      });
    }

    if (err.code === "23503") {
      return res.status(400).json({
        error: "User tidak ditemukan. Gagal menyimpan ikon.",
      });
    }

    return res.status(500).json({
      error: "Gagal menyimpan metadata ikon. Cek log server.",
    });
  }
});

export default router;
