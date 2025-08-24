// src/controllers/toponimiController.js
import client from "../config/database.js";

export const getToponimiIcons = async (req, res) => {
  try {
    const result = await client.query(`
      SELECT 
        ti.id, 
        ti.filename, 
        ti.slug, 
        ti.name,
        tc.slug AS category_slug,
        tc.name AS category_name
      FROM toponimi_icons ti
      LEFT JOIN toponimi_categories tc ON ti.category_id = tc.id
      WHERE ti.is_active = true
      ORDER BY tc.display_order, ti.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Gagal ambil ikon:", error);
    res.status(500).json({ error: "Gagal ambil data ikon" });
  }
};
