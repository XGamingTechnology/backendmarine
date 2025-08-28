// src/controllers/uploadController.js
import db from "../config/database.js";

/**
 * Controller: Upload CSV Echosounder
 * Harus dipanggil melalui route yang sudah pakai `authenticate`
 * Jadi `req.user` sudah tersedia
 */

export const importEchosounderCSV = async (req, res) => {
  // 🔥 LOG PENTING: Cek req.user
  console.log("👤 [UPLOAD] req.user:", req.user);
  if (!req.user) {
    console.error("❌ [UPLOAD] req.user tidak tersedia");
    return res.status(401).json({ error: "Unauthorized: Akses ditolak" });
  }

  console.log("🆔 [UPLOAD] user.id:", req.user.id);
  if (!req.user.id) {
    console.error("❌ [UPLOAD] user.id tidak valid:", req.user);
    return res.status(401).json({ error: "Invalid user data" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "File tidak ditemukan" });
  }

  const buffer = req.file.buffer.toString("utf-8");
  const lines = buffer.trim().split(/\r\n|\n/);

  if (lines.length < 2) {
    return res.status(400).json({ error: "CSV kosong atau tidak valid" });
  }

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim());

  // ✅ Deteksi kolom
  const mapping = {};
  headers.forEach((h) => {
    const norm = h.toLowerCase().trim();
    if (norm.includes("jarak") || norm.includes("distance") || norm.includes("dist")) {
      mapping.jarak = h;
    }
    if (norm.includes("kedalaman") || norm.includes("depth") || norm.includes("deep")) {
      mapping.kedalaman = h;
    }
    if (norm.includes("latitude") || norm.includes("lat")) {
      mapping.latitude = h;
    }
    if (norm.includes("longitude") || norm.includes("lon")) {
      mapping.longitude = h;
    }
  });

  if (!mapping.jarak || !mapping.kedalaman) {
    return res.status(400).json({
      error: "CSV harus punya kolom jarak dan kedalaman",
      found: mapping,
    });
  }

  const surveyId = `SURVEY_${Date.now()}`;
  const results = [];

  // Loop baris data (mulai dari 1, lewati header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",");
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() || null;
    });

    const jarak = parseFloat(row[mapping.jarak]);
    const kedalaman = parseFloat(row[mapping.kedalaman]);
    const latitude = mapping.latitude ? parseFloat(row[mapping.latitude]) : null;
    const longitude = mapping.longitude ? parseFloat(row[mapping.longitude]) : null;

    if (isNaN(jarak) || isNaN(kedalaman)) continue;

    // ✅ Buat metadata
    const metadata = {
      survey_id: surveyId,
      distance_m: jarak,
      depth_value: kedalaman,
      kedalaman: kedalaman,
      origin: "echosounder_csv",
      original_filename: req.file.originalname,
      sequence: i,
    };

    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
      metadata.latitude = latitude;
      metadata.longitude = longitude;
    }

    let geom = null;
    if (metadata.latitude && metadata.longitude) {
      geom = { type: "Point", coordinates: [longitude, latitude] };
    }

    const name = `Titik ${jarak}m`;
    const description = `Kedalaman: ${Math.abs(kedalaman)}m`;

    const query = `
      INSERT INTO spatial_features (
        layer_type, 
        name, 
        description, 
        geom, 
        source, 
        metadata, 
        user_id, 
        is_shared, 
        created_at
      ) VALUES (
        $1, $2, $3, 
        ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 
        $5, $6, $7, false, NOW()
      )
      RETURNING id
    `;

    try {
      const result = await db.query(query, [
        "valid_sampling_point", // $1
        name, // $2
        description, // $3
        geom ? JSON.stringify(geom) : null, // $4
        "import", // $5
        metadata, // $6
        req.user.id, // $7 → ✅ HARUS SAMA DENGAN YANG DI TOKEN
      ]);

      console.log(`✅ [DB] Titik ${i} disimpan: user_id=${req.user.id}, survey_id=${surveyId}, id=${result.rows[0].id}`);
      results.push({ jarak, kedalaman, latitude, longitude });
    } catch (err) {
      console.error("❌ [DB] Gagal simpan titik:", err);
      return res.status(500).json({
        error: "Gagal simpan ke database",
        detail: err.message,
      });
    }
  }

  if (results.length === 0) {
    return res.status(400).json({ error: "Tidak ada data valid yang berhasil diproses" });
  }

  // ✅ Berhasil
  console.log(`✅ [UPLOAD] Sukses: ${results.length} titik dari ${surveyId}, user_id: ${req.user.id}`);
  res.json({
    success: true,
    count: results.length,
    results,
    surveyId,
  });
};
