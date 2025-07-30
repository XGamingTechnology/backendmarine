// // update-all-passwords.js
// import { Client } from "pg";
// import bcrypt from "bcrypt";
// import dotenv from "dotenv";

// dotenv.config();

// // Mapping email → password default
// const DEFAULT_PASSWORDS = {
//   "admin@webgis-musi.id": "admin123",
//   "user1@webgis-musi.id": "user123",
//   "viewer@webgis-musi.id": "viewer123",
//   "lapangan1@webgis-musi.id": "lapangan123",
//   // Tambahkan user lain jika ada
// };

// // Koneksi ke PostgreSQL
// const client = new Client({
//   host: process.env.DB_HOST || "localhost",
//   port: process.env.DB_PORT || 5432,
//   user: process.env.DB_USER || "postgres",
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME || "webgis_sungai_musi",
// });

// async function updateAllPasswords() {
//   try {
//     await client.connect();
//     console.log("✅ Terhubung ke database");

//     // Ambil semua user
//     const result = await client.query("SELECT id, email, password_hash FROM users");
//     console.log(`\n📊 Ditemukan ${result.rows.length} user`);

//     for (const user of result.rows) {
//       const email = user.email;
//       const defaultPassword = DEFAULT_PASSWORDS[email];

//       if (!defaultPassword) {
//         console.warn(`🟡 Lewati user: ${email} (tidak ada password default)`);
//         continue;
//       }

//       // Generate hash baru
//       const hash = await bcrypt.hash(defaultPassword, 10);
//       console.log(`🔐 ${email} | Password: ${defaultPassword} → Hash: ${hash}`);

//       // Update di database
//       await client.query("UPDATE users SET password_hash = $1 WHERE email = $2", [hash, email]);
//       console.log(`✅ Berhasil update password untuk: ${email}\n`);
//     }

//     console.log("🎉 SEMUA USER BERHASIL DIUPDATE DENGAN HASH YANG VALID!");
//     console.log("🚀 Sekarang login HARUS berhasil untuk semua user.");
//   } catch (err) {
//     console.error("❌ Error:", err.message);
//   } finally {
//     await client.end();
//   }
// }

// // Jalankan
// updateAllPasswords();
