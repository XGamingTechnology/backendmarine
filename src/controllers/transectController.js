// src/controllers/transectController.js

// ✅ Ganti require → import (dan tambahkan .js)
import { processTransects } from "../services/spatialService.js";

// Handler untuk endpoint
async function processTransectsHandler(req, res) {
  const { surveyId, rawTransects, areaId } = req.body;

  // Validasi input
  if (!surveyId || !rawTransects || !areaId) {
    return res.status(400).json({
      error: "Missing required fields: surveyId, rawTransects, areaId",
    });
  }

  try {
    // Panggil fungsi dari service
    await processTransects(surveyId, rawTransects, areaId);

    // Beri respons sukses
    res.json({
      success: true,
      message: "Transek berhasil diproses dan disimpan.",
    });
  } catch (err) {
    console.error("Error processing transects:", err);
    res.status(500).json({
      error: "Gagal proses transek di database.",
      details: err.message, // Opsional: tambahkan detail error untuk debugging
    });
  }
}

// ✅ Ganti module.exports → export
export { processTransectsHandler };
