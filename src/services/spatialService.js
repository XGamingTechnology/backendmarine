// src/services/spatialService.js

// ✅ Ganti require → import (dan tambahkan .js)
import db from "../config/database.js";

// Fungsi untuk memanggil stored function di PostGIS
async function processTransects(surveyId, rawTransects, areaId) {
  try {
    await db.none("SELECT process_transects($1, $2, $3)", [surveyId, rawTransects, areaId]);
    console.log(`✅ Transek untuk survey ${surveyId} berhasil diproses di database.`);
  } catch (err) {
    console.error("❌ Gagal memanggil fungsi process_transects di database:", err);
    throw err; // Lemparkan error agar bisa ditangkap di controller
  }
}

// ✅ Ganti module.exports → export
export { processTransects };
