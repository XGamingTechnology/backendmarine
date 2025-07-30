// src/config/database.js
import { Client } from "pg";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Konfigurasi klien PostgreSQL
const client = new Client({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD, // Jangan beri default password di kode (bisa bocor)
  database: process.env.DB_NAME || "webgis_sungai_musi", // Nama DB lebih spesifik
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false, // Untuk koneksi ke DB remote
});

// Handle koneksi
client
  .connect()
  .then(() => {
    console.log("✅ Connected to PostgreSQL");
    console.log(`🗄️  Database: ${client.database}`);
    console.log(`👤 User: ${client.user}`);
    console.log(`🏠 Host: ${client.host}:${client.port}`);
  })
  .catch((err) => {
    console.error("❌ Gagal koneksi ke PostgreSQL:");
    console.error("   Message:", err.message);
    console.error("   Code:", err.code);
    console.error("   Detail:", err.detail || "Tidak ada detail");
    process.exit(1); // Hentikan proses jika gagal koneksi
  });

// Handle error selama runtime
client.on("error", (err) => {
  console.error("⚠️  Koneksi database error:", err);
  // Jangan exit, coba reconnect atau log
});

export default client;
