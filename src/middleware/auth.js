// src/middleware/auth.js
import jwt from "jsonwebtoken";

/**
 * Middleware: Cek dan verifikasi JWT
 * Jika valid → simpan `req.user` dengan properti `.id`
 * Jika tidak → kirim 401
 */
export const authenticate = (req, res, next) => {
  const authHeader = req.headers?.authorization;

  // Cek apakah ada header Authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Akses ditolak. Token tidak diberikan.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verifikasi token dengan secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "rahasia");

    console.log("🔐 [AUTH] JWT Decoded:", decoded); // 🔥 Log untuk debug

    // ✅ Normalisasi: pastikan req.user punya .id
    req.user = {
      id: decoded.id, // ✅ Sudah benar
      role: decoded.role,
      email: decoded.email,
    };
    console.log("👤 [AUTH] req.user normalized:", req.user); // ✅ Log hasil normalisasi
    next(); // Lanjut ke route berikutnya
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Sesi telah berakhir. Silakan login kembali.",
      });
    }
    return res.status(401).json({
      error: "Token tidak valid.",
    });
  }
};
