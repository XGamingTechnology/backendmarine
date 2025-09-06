// src/controllers/uploadController.js
import csv from "csv-parser";
import { Readable } from "stream";
import client from "../config/database.js";
import * as utm from "utm";

// ✅ Validasi ekstensi file
const isValidCSV = (originalname) => {
  return /\.csv$/i.test(originalname);
};

// ✅ Konversi buffer ke stream dengan aman
const bufferToStream = (buffer) => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

/**
 * Import CSV echosounder: baca file, konversi koordinat, simpan ke DB
 */
export const importEchosounderCSV = async (req, res) => {
  const { user } = req;

  // ❌ Cek file
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "File tidak ditemukan. Harap unggah file CSV.",
    });
  }

  // ❌ Cek ekstensi
  if (!isValidCSV(req.file.originalname)) {
    return res.status(400).json({
      success: false,
      error: `Format file tidak didukung: ${req.file.originalname}. Hanya file .csv yang diperbolehkan.`,
    });
  }

  const results = [];
  const surveyId = `SURVEY_${Date.now()}_${user.id}`;
  const is3D = req.body.is3D === "true";

  // 📊 Parsing CSV
  bufferToStream(req.file.buffer)
    .pipe(csv())
    .on("data", (row) => {
      results.push(row);
    })
    .on("end", async () => {
      if (results.length === 0) {
        return res.status(400).json({
          success: false,
          error: "File CSV kosong atau tidak memiliki data yang dapat dibaca.",
        });
      }

      try {
        const query = `
          INSERT INTO spatial_features (layer_type, name, geom, source, metadata, user_id, is_shared)
          VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, false)
          RETURNING id;
        `;

        const insertedIds = [];

        for (const [index, row] of results.entries()) {
          // ✅ Baca nilai dari CSV
          const jarak = parseFloat(row["Jarak dari Awal (m)"]) || parseFloat(row.jarak) || parseFloat(row.distance) || index * 10;
          const kedalaman = parseFloat(row["Kedalaman (m)"]) || parseFloat(row.kedalaman) || parseFloat(row.depth) || 0;
          const offset = parseFloat(row["Offset (m)"]) || parseFloat(row.offset) || parseFloat(row.offset_m) || 0;

          if (isNaN(jarak) || isNaN(kedalaman)) {
            console.warn("⚠️ Data tidak valid dilewati:", row);
            continue;
          }

          let lat, lon;

          // 🔍 DETEKSI FORMAT KOORDINAT
          const rawLat = parseFloat(row.Latitude) || parseFloat(row.lat) || parseFloat(row.latitude);
          const rawLon = parseFloat(row.Longitude) || parseFloat(row.lon) || parseFloat(row.longitude);
          const easting = parseFloat(row.Easting) || parseFloat(row.x) || parseFloat(row.easting);
          const northing = parseFloat(row.Northing) || parseFloat(row.y) || parseFloat(row.northing);
          const zone = row.Zone || row.zone || row.zona; // misal: "48M"

          if (!isNaN(rawLat) && !isNaN(rawLon)) {
            // ✅ Format LatLon
            lat = rawLat;
            lon = rawLon;
          } else if (!isNaN(easting) && !isNaN(northing)) {
            // ✅ Format UTM
            try {
              const result = utm.toLatLon(easting, northing, zone ? parseInt(zone) : 48, zone?.endsWith("M") ? "M" : "N");
              lat = result.latitude;
              lon = result.longitude;
            } catch (err) {
              console.error("❌ Gagal konversi UTM:", err);
              continue;
            }
          } else {
            // ❌ Tidak ada koordinat valid
            console.warn("❌ Tidak ada koordinat valid:", row);
            continue;
          }

          // ✅ Metadata
          const metadata = {
            survey_id: surveyId,
            jarak,
            distance_m: jarak,
            offset_m: offset,
            kedalaman,
            depth_value: -Math.abs(kedalaman), // Nilai negatif ke bawah
            sequence: index,
            is_3d: is3D || false,
            source: "import",
            coord_source: !isNaN(rawLat) ? "LatLon" : "UTM",
            ...(easting &&
              northing && {
                utm_easting: easting,
                utm_northing: northing,
                utm_zone: zone,
              }),
          };

          const name = `Point ${jarak}m`;

          try {
            const result = await client.query(query, ["echosounder_point", name, lon, lat, "import", metadata, user.id]);
            insertedIds.push(result.rows[0].id);
          } catch (dbErr) {
            console.error("❌ Gagal simpan titik:", dbErr);
            continue; // Lanjut ke titik berikutnya
          }
        }

        const surveyMeta = {
          surveyId,
          date: new Date().toLocaleDateString("id-ID"),
          count: insertedIds.length,
          type: is3D ? "3d" : "2d",
          source: "import",
          uploadedAt: new Date().toISOString(),
        };

        res.json({
          success: true,
          surveyId,
          count: insertedIds.length,
          type: is3D ? "3d" : "2d",
          message: `${insertedIds.length} titik berhasil diimpor`,
          surveyMeta,
        });
      } catch (err) {
        console.error("❌ Gagal simpan ke database:", err);
        res.status(500).json({
          success: false,
          error: "Gagal menyimpan data ke database. Cek koneksi atau struktur tabel.",
        });
      }
    })
    .on("error", (err) => {
      console.error("❌ Gagal parsing CSV:", err);
      res.status(500).json({
        success: false,
        error: "Gagal membaca file CSV. Pastikan format benar.",
      });
    });
};

// ✅ Export middleware untuk digunakan di route
export const uploadCSV = (req, res, next) => {
  // Middleware ini akan dihandle oleh multerConfig.js
  next();
};
