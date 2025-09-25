// src/controllers/contourController.js
import { generateContours as generateContoursService } from "../services/contourService.js";
import pool from "../config/database.js";

// ✅ Fungsi bantu: Buat kontur manual sebagai fallback
function createFallbackContour(points, depthValue, centroid) {
  if (!centroid || points.length === 0) return null;

  // Hitung radius rata-rata dari centroid ke titik
  const avgDist =
    points.reduce((sum, p) => {
      const dx = p.x - centroid.x;
      const dy = p.y - centroid.y;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0) / points.length;

  // Buat lingkaran sederhana (8 titik)
  const numPoints = 16;
  const coords = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    coords.push([centroid.x + avgDist * Math.cos(angle), centroid.y + avgDist * Math.sin(angle)]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { depth: parseFloat(depthValue.toFixed(2)) },
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
      },
    ],
  };
}

export const generateContours = async (req, res) => {
  try {
    const { survey_id, user_id, interval = 1.0, gridResolution = 100 } = req.body;

    // Validasi dasar
    if (!survey_id || !user_id) {
      return res.status(400).json({ error: "survey_id dan user_id wajib" });
    }

    // Validasi interval & grid
    const safeInterval = Math.max(0.1, Math.min(10, parseFloat(interval) || 1.0));
    const safeGridRes = Math.max(50, Math.min(300, parseInt(gridResolution) || 100));

    // Ambil titik sampling
    const { rows } = await pool.query(
      `SELECT 
         ST_X(geom) as x, 
         ST_Y(geom) as y,
         COALESCE(
           (metadata->>'depth_value')::float,
           (metadata->>'kedalaman')::float,
           0.0
         ) as z
       FROM spatial_features 
       WHERE layer_type = 'valid_sampling_point'
         AND (metadata->>'survey_id' = $1 OR survey_id = $1)
         AND user_id = $2`,
      [survey_id, user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Tidak ada titik sampling untuk survey ini" });
    }

    // ✅ Validasi minimal titik
    if (rows.length < 3) {
      return res.status(400).json({
        error: "Minimal 3 titik sampling diperlukan untuk generate kontur",
        debug: { pointCount: rows.length },
      });
    }

    // ✅ Ekstrak kedalaman valid
    const depths = rows.map((r) => r.z).filter((z) => isFinite(z));
    if (depths.length === 0) {
      return res.status(400).json({ error: "Semua kedalaman tidak valid (NaN/Infinity)" });
    }

    // ✅ Ambil centroid untuk fallback
    const centroidResult = await pool.query(
      `SELECT 
         ST_X(ST_Centroid(ST_Collect(geom))) as x,
         ST_Y(ST_Centroid(ST_Collect(geom))) as y
       FROM spatial_features 
       WHERE layer_type = 'valid_sampling_point'
         AND (metadata->>'survey_id' = $1 OR survey_id = $1)
         AND user_id = $2`,
      [survey_id, user_id]
    );
    const centroid = centroidResult.rows[0];

    // ✅ DETEKSI DATA HOMOGEN
    const uniqueDepths = [...new Set(depths.map((d) => parseFloat(d.toFixed(3))))];
    const isHomogeneous = uniqueDepths.length === 1;

    let geojson = null;
    let generateParams = {};
    let usedFallback = false;

    // === TAHAP 1: COBA GENERATE KONTUR NORMAL ===
    try {
      if (isHomogeneous) {
        const depthValue = uniqueDepths[0];
        console.log(`⚠️ Data homogen terdeteksi: semua titik = ${depthValue} meter`);
        geojson = generateContoursService(rows, {
          forceLevels: [depthValue],
          gridWidth: safeGridRes,
          gridHeight: safeGridRes,
        });
        generateParams = { type: "homogeneous", depth: depthValue, gridResolution: safeGridRes };
      } else {
        const minZ = Math.min(...depths);
        const maxZ = Math.max(...depths);
        const buffer = Math.max(safeInterval / 2, 0.5);
        const actualMin = minZ - buffer;
        const actualMax = maxZ + buffer;

        let levels = [];
        let current = Math.floor(actualMin / safeInterval) * safeInterval;
        while (current <= actualMax) {
          if (current >= minZ - 0.1 && current <= maxZ + 0.1) {
            levels.push(parseFloat(current.toFixed(2)));
          }
          current += safeInterval;
        }

        if (levels.length === 0) {
          const midDepth = (minZ + maxZ) / 2;
          levels = [parseFloat(midDepth.toFixed(2))];
        }

        console.log(`📏 Kedalaman: ${minZ.toFixed(2)} → ${maxZ.toFixed(2)} meter`);
        console.log(`🎯 Generate kontur pada level:`, levels);

        geojson = generateContoursService(rows, {
          forceLevels: levels,
          gridWidth: safeGridRes,
          gridHeight: safeGridRes,
        });
        generateParams = { type: "variable", levels, gridResolution: safeGridRes, depthRange: [minZ, maxZ] };
      }

      // Hitung garis
      let totalLines = 0;
      for (const f of geojson.features) {
        if (f.geometry.type === "MultiLineString") {
          totalLines += f.geometry.coordinates.length;
        }
      }

      if (totalLines === 0) {
        throw new Error("No lines generated");
      }
    } catch (normalErr) {
      console.warn("⚠️ Generate kontur normal gagal:", normalErr.message);
      geojson = null;
    }

    // === TAHAP 2: JIKA GAGAL, GUNAKAN FALLBACK MANUAL ===
    if (!geojson || (geojson.features && geojson.features.length === 0)) {
      console.log("🔧 Mengaktifkan fallback kontur manual...");

      const fallbackDepth = isHomogeneous ? uniqueDepths[0] : (Math.min(...depths) + Math.max(...depths)) / 2;

      geojson = createFallbackContour(rows, fallbackDepth, centroid);
      usedFallback = true;

      if (!geojson) {
        return res.status(400).json({
          error: "Gagal membuat kontur fallback. Data tidak memadai.",
          debug: { pointCount: rows.length, depths: uniqueDepths },
        });
      }

      generateParams = {
        type: "fallback_manual",
        depth: parseFloat(fallbackDepth.toFixed(2)),
        gridResolution: 50, // resolusi rendah
        pointCount: rows.length,
      };
    }

    // Hitung garis akhir
    let totalLines = 0;
    for (const f of geojson.features) {
      if (f.geometry.type === "MultiLineString") {
        totalLines += f.geometry.coordinates.length;
      } else if (f.geometry.type === "Polygon") {
        totalLines += 1; // fallback dihitung sebagai 1 garis
      }
    }

    console.log(`🎨 Kontur akhir: ${geojson.features.length} fitur, ${totalLines} garis ${usedFallback ? "(fallback)" : ""}`);

    // Hapus kontur lama
    await pool.query(
      `DELETE FROM spatial_features 
       WHERE layer_type = 'kontur_batimetri' 
         AND (metadata->>'survey_id') = $1 
         AND user_id = $2`,
      [survey_id, user_id]
    );

    // Simpan hasil
    let insertedCount = 0;
    for (const feature of geojson.features) {
      let lineGeoJSON;
      const depth = feature.properties.depth;

      if (feature.geometry.type === "Polygon") {
        // Fallback: ambil ring luar sebagai LineString
        lineGeoJSON = {
          type: "LineString",
          coordinates: feature.geometry.coordinates[0],
        };
      } else if (feature.geometry.type === "MultiLineString") {
        for (const lineCoords of feature.geometry.coordinates) {
          if (!Array.isArray(lineCoords) || lineCoords.length < 2) continue;
          const validCoords = lineCoords.filter(
            (coord) => Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === "number" && typeof coord[1] === "number" && isFinite(coord[0]) && isFinite(coord[1]) && Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90
          );
          if (validCoords.length < 2) continue;
          lineGeoJSON = { type: "LineString", coordinates: validCoords };
          // Simpan tiap LineString
          await saveContourLine(lineGeoJSON, depth, generateParams, survey_id, user_id);
          insertedCount++;
        }
        continue;
      } else {
        lineGeoJSON = feature.geometry;
      }

      // Simpan LineString
      await saveContourLine(lineGeoJSON, depth, generateParams, survey_id, user_id);
      insertedCount++;
    }

    console.log(`✅ Berhasil menyimpan ${insertedCount} garis kontur ${usedFallback ? "(fallback)" : ""}`);

    res.status(200).json({
      success: true,
      message: usedFallback ? "Kontur berhasil digenerate (menggunakan fallback sederhana)" : isHomogeneous ? "Kontur berhasil digenerate (data homogen)" : "Kontur berhasil digenerate",
      inserted: insertedCount,
      parameters: generateParams,
      ...(usedFallback && { warning: "Data kurang variatif, menggunakan kontur perkiraan" }),
    });
  } catch (error) {
    console.error("🔥 Error fatal di contourController:", error);
    res.status(500).json({
      error: "Gagal generate kontur batimetri",
      message: error.message,
    });
  }
};

// ✅ Fungsi bantu: Simpan satu garis kontur
async function saveContourLine(lineGeoJSON, depth, generateParams, survey_id, user_id) {
  const metadata = {
    layerType: "kontur_batimetri",
    survey_id,
    user_id,
    generated_at: new Date().toISOString(),
    depth: depth,
    ...generateParams,
  };

  try {
    await pool.query(
      `INSERT INTO spatial_features (geom, layer_type, metadata, user_id, created_at, updated_at)
       VALUES (
         ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
         'kontur_batimetri',
         $2::jsonb,
         $3,
         NOW(),
         NOW()
       )`,
      [JSON.stringify(lineGeoJSON), JSON.stringify(metadata), user_id]
    );
  } catch (dbErr) {
    console.error(`❌ Gagal insert garis depth=${depth}:`, dbErr.message);
  }
}
