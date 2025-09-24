// src/controllers/authController.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import client from "../config/database.js";

const authController = {
  /**
   * POST /api/auth/login
   * Login user dan kirim token + data user
   */
  login: async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi",
      });
    }

    try {
      const result = await client.query(
        `SELECT id, username, email, password_hash, role, full_name, avatar_url 
         FROM users 
         WHERE email = $1 AND is_active = true`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Password salah",
        });
      }

      // ✅ PERBAIKAN UTAMA: Gunakan 'userId' agar konsisten dengan register() dan middleware
      const token = jwt.sign(
        { userId: user.id, role: user.role, email: user.email }, // <-- Ganti 'id' menjadi 'userId'
        process.env.JWT_SECRET || "rahasia",
        { expiresIn: "24h" }
      );

      res.json({
        success: true,
        message: "Login berhasil",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan server",
      });
    }
  },

  /**
   * POST /api/auth/register
   * Registrasi user baru (role default = 'user')
   */
  register: async (req, res) => {
    const { name, email, password, role = "user" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Semua field wajib diisi",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 6 karakter",
      });
    }

    try {
      const check = await client.query("SELECT id FROM users WHERE email = $1", [email]);
      if (check.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Email sudah terdaftar",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await client.query(
        `INSERT INTO users (username, email, password_hash, role, full_name, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, email, role, full_name, avatar_url`,
        [name, email, hashedPassword, role, name, "/images/user-default.png"]
      );

      const newUser = result.rows[0];
      // ✅ Sudah benar: Menggunakan 'userId'
      const token = jwt.sign({ userId: newUser.id, role: newUser.role, email: newUser.email }, process.env.JWT_SECRET || "rahasia", { expiresIn: "24h" });

      res.json({
        success: true,
        message: "Registrasi berhasil",
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          fullName: newUser.full_name,
          avatarUrl: newUser.avatar_url,
        },
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({
        success: false,
        message: "Gagal registrasi. Coba lagi.",
      });
    }
  },
};

export default authController;
