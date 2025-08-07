// src/services/spatialService.js

// ✅ Import database
import db from "../config/database.js";

/**
 * Panggil fungsi PostGIS process_transects
 * @param {string} surveyId - ID unik survei
 * @param {Object} rawTransects - GeoJSON FeatureCollection transek mentah
 * @param {number} areaId - ID area_sungai di spatial_features
 */
async function processTransects(surveyId, rawTransects, areaId) {
  try {
    // ❌ Jangan gunakan db.none()
    // ✅ Gunakan db.one() atau db.result() karena kita ingin respon dari mutation
    const result = await db.one("SELECT process_transects($1, $2, $3) AS success, 'Transek berhasil diproses' AS message", [surveyId, rawTransects, areaId]);

    console.log(`✅ Transek untuk survey ${surveyId} berhasil diproses di database.`);
    return result; // { success: true, message: '...' }
  } catch (err) {
    console.error("❌ Gagal memanggil fungsi process_transects di database:", err);

    // Jika error dari PostGIS (RAISE EXCEPTION)
    if (err.message.includes("tidak ditemukan di spatial_features")) {
      throw new Error(err.message);
    }

    throw new Error(`Gagal proses transek: ${err.message}`);
  }
}

/**
 * Ambil hasil transek yang sudah divalidasi
 * @param {string} surveyId
 */
async function getValidatedTransects(surveyId) {
  const query = `
    SELECT 
      transect_id,
      is_valid,
      reason,
      clipped_length,
      ST_AsGeoJSON(geom_line)::json AS geometry,
      ST_AsGeoJSON(geom_point)::json AS point_geometry
    FROM survey_transects 
    WHERE survey_id = $1
  `;
  try {
    const result = await db.any(query, [surveyId]);
    return result.map((row) => ({
      transectId: row.transect_id,
      isValid: row.is_valid,
      reason: row.reason,
      clippedLength: parseFloat(row.clipped_length?.toFixed(2) || 0),
      geometry: row.geometry,
      pointGeometry: row.point_geometry,
    }));
  } catch (err) {
    console.error("Error fetching validated transects:", err);
    throw new Error("Gagal ambil data validasi");
  }
}

// ✅ Export
export { processTransects, getValidatedTransects };
