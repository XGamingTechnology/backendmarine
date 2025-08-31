// src/controllers/uploadController.js
import csv from "csv-parser";
import { Readable } from "stream";
import client from "../config/database.js";

/**
 * Controller: Upload CSV Echosounder → simpan ke spatial_features
 */
export const importEchosounderCSV = async (req, res) => {
  const { user } = req; // ✅ Dari authenticate

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "File tidak ditemukan",
    });
  }

  const results = [];
  const surveyId = `SURVEY_${Date.now()}_${user.id}`; // Unik per user
  const is3D = req.body.is3D === "true"; // Opsional: kirim dari frontend

  // Konversi buffer ke stream
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

      let clientDB;
      try {
        clientDB = await client.connect();
        const query = `
          INSERT INTO spatial_features (layer_type, name, geom, source, metadata, user_id, is_shared)
          VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, false)
          RETURNING id;
        `;

        const insertedIds = [];

        for (const [index, row] of results.entries()) {
          // Parsing data
          const jarak = parseFloat(row.jarak) || parseFloat(row.distance) || index * 10;
          const kedalaman = parseFloat(row.kedalaman) || parseFloat(row.depth) || 0;
          const offset = parseFloat(row.offset) || parseFloat(row.offset_m) || 0;

          // 🔢 Validasi angka
          if (isNaN(jarak) || isNaN(kedalaman)) {
            console.warn("⚠️ Data tidak valid dilewati:", row);
            continue;
          }

          // 🌍 Koordinat dummy (bisa dihitung dari transect nanti)
          const baseLon = 104.76;
          const baseLat = -2.98;
          const lon = baseLon + offset / 100_000;
          const lat = baseLat + jarak / 100_000;

          // 📦 Metadata
          const metadata = {
            survey_id: surveyId,
            jarak: jarak,
            kedalaman: kedalaman,
            offset_m: offset,
            sequence: index,
            is_3d: is3D || false,
          };

          const name = `Point ${jarak}m`;

          const result = await clientDB.query(query, ["valid_sampling_point", name, lon, lat, "import", metadata, user.id]);

          insertedIds.push(result.rows[0].id);
        }

        // ✅ Metadata untuk frontend
        const surveyMeta = {
          surveyId,
          date: new Date().toLocaleDateString("id-ID"),
          count: insertedIds.length,
          type: is3D ? "3d" : "2d",
          source: "import",
          uploadedAt: new Date().toISOString(),
        };

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
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
      } finally {
        if (clientDB) clientDB.release();
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
