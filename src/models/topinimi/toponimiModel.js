// src/models/toponimiModel.js
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function getToponimiIcons() {
  const result = await client.query(`
    SELECT 
      ti.id, 
      ti.slug || '.png' AS filename,  // ✅ Pakai slug + .png
      ti.slug, 
      ti.name,
      tc.slug AS category_slug,
      tc.name AS category_name
    FROM toponimi_icons ti
    LEFT JOIN toponimi_categories tc ON ti.category_id = tc.id
    WHERE ti.is_active = true
    ORDER BY tc.display_order, ti.name
  `);
  return result.rows;
}

module.exports = {
  getToponimiIcons,
};
