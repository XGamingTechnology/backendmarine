// src/controllers/uploadController.js
import csv from "csv-parser";
import { Readable } from "stream";
import client from "../config/database.js";

export const importEchosounderCSV = async (req, res) => {
  const { user } = req;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "File tidak ditemukan",
    });
  }

  const results = [];
  const surveyId = `SURVEY_${Date.now()}_${user.id}`;
  const is3D = req.body.is3D === "true";

  const stream = Readable.from(req.file.buffer.toString());
  stream
    .pipe(csv())
    .on("data", (row) => {
      results.push(row);
    })
    .on("end", async () => {
      if (results.length === 0) {
        return res.status(400).json({
          success: false,
          error: "File CSV kosong atau format tidak valid",
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
          // ✅ Baca dari nama kolom yang benar
          const jarak = parseFloat(row["Jarak dari Awal (m)"]) || parseFloat(row.jarak) || parseFloat(row.distance) || index * 10;

          const kedalaman = parseFloat(row["Kedalaman (m)"]) || parseFloat(row.kedalaman) || parseFloat(row.depth) || 0;

          const offset = parseFloat(row["Offset (m)"]) || parseFloat(row.offset) || parseFloat(row.offset_m) || 0;

          if (isNaN(jarak) || isNaN(kedalaman)) {
            console.warn("⚠️ Data tidak valid dilewati:", row);
            continue;
          }

          // 🌍 Koordinat dummy (untuk preview)
          const baseLon = 104.76;
          const baseLat = -2.98;
          const lon = baseLon + offset / 100_000;
          const lat = baseLat + jarak / 100_000;

          // ✅ Metadata: tambahkan depth_value agar chart langsung jalan
          const metadata = {
            survey_id: surveyId,
            jarak: jarak,
            distance_m: jarak, // ✅ Untuk longitudinal
            offset_m: offset, // ✅ Untuk cross-section
            kedalaman: kedalaman,
            depth_value: kedalaman, // ✅ Agar chart baca langsung
            sequence: index,
            is_3d: is3D || false,
          };

          const name = `Point ${jarak}m`;

          const result = await client.query(query, ["valid_sampling_point", name, lon, lat, "import", metadata, user.id]);

          insertedIds.push(result.rows[0].id);
        }

        // ✅ Simpan metadata survey untuk frontend
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
          error: "Gagal menyimpan data ke database",
        });
      }
    })
    .on("error", (err) => {
      console.error("❌ Gagal parsing CSV:", err);
      res.status(500).json({
        success: false,
        error: "Gagal membaca file CSV",
      });
    });
};
