// src/graphql/resolvers/index.js
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "webgis_sungai_musi",
});

client
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ Gagal koneksi:", err.message));

// --- Fungsi bantu ---
const isValidNumber = (value) => !isNaN(parseFloat(value)) && isFinite(value);
const toNumber = (value) => {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

const resolvers = {
  Query: {
    spatialFeatures: async (_, { layerType, source }) => {
      let query = `
        SELECT id, layer_type, name, description, 
               ST_AsGeoJSON(geom)::json AS geometry, 
               created_at, updated_at, created_by, source, metadata
        FROM spatial_features
      `;
      const params = [];
      const whereClause = [];

      if (layerType) {
        whereClause.push(`layer_type = $${params.length + 1}`);
        params.push(layerType);
      }
      if (source) {
        whereClause.push(`source = $${params.length + 1}`);
        params.push(source);
      }

      if (whereClause.length > 0) {
        query += " WHERE " + whereClause.join(" AND ");
      }

      try {
        const result = await client.query(query, params);
        return result.rows.map((row) => ({
          id: row.id,
          layerType: row.layer_type,
          name: row.name,
          description: row.description,
          geometry: row.geometry,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          createdBy: row.created_by,
          source: row.source,
          meta: row.metadata,
        }));
      } catch (err) {
        console.error("Error fetching spatialFeatures:", err);
        throw new Error("Gagal ambil data");
      }
    },

    layerDefinitions: async () => {
      const query = `SELECT id, name, description, layer_type, source, metadata, group_id FROM layer_definitions`;
      try {
        const result = await client.query(query);
        return result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          layerType: row.layer_type,
          source: row.source,
          meta: row.metadata,
          groupId: row.group_id,
        }));
      } catch (err) {
        console.error("Error fetching layerDefinitions:", err);
        throw new Error("Gagal ambil definisi layer");
      }
    },

    layerOptions: async (_, { layerType }) => {
      const query = `SELECT id, name, layer_type FROM spatial_features WHERE layer_type = $1 ORDER BY name`;
      try {
        const result = await client.query(query, [layerType]);
        return result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          layerType: row.layer_type,
        }));
      } catch (err) {
        console.error("Error fetching layerOptions:", err);
        throw new Error("Gagal ambil opsi layer");
      }
    },
  },

  Mutation: {
    createSpatialFeature: async (_, { layerType, name, description, geometry, source, meta }) => {
      if (!layerType || !geometry || typeof geometry !== "object") throw new Error("Data tidak valid");

      if (geometry.type === "Point") {
        const [rawLon, rawLat] = geometry.coordinates;
        if (!isValidNumber(rawLon) || !isValidNumber(rawLat)) throw new Error("Koordinat tidak valid");
        geometry.coordinates = [toNumber(rawLon), toNumber(rawLat)];
      }

      if (["LineString", "Polygon"].includes(geometry.type)) {
        const normalize = (arr) => (Array.isArray(arr[0]) ? arr.map(normalize) : [toNumber(arr[0]), toNumber(arr[1])]);
        geometry.coordinates = normalize(geometry.coordinates);
      }

      const query = `
        INSERT INTO spatial_features (layer_type, name, description, geom, source, metadata)
        VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6)
        RETURNING id, layer_type, name, description, ST_AsGeoJSON(geom)::json AS geometry, created_at, source, metadata
      `;

      try {
        const result = await client.query(query, [layerType, name || null, description || null, JSON.stringify(geometry), source || "manual", meta || {}]);
        const row = result.rows[0];
        return {
          id: row.id,
          layerType: row.layer_type,
          name: row.name,
          description: row.description,
          geometry: row.geometry,
          createdAt: row.created_at,
          source: row.source,
          meta: row.metadata,
        };
      } catch (err) {
        console.error("❌ Error saat insert ke DB:", err);
        throw new Error(`Gagal menyimpan: ${err.message}`);
      }
    },

    // --- 1. Simpan Draft Garis Sungai ---
    saveRiverLineDraft: async (_, { geom }) => {
      if (!geom || geom.type !== "LineString" || geom.coordinates.length < 2) {
        throw new Error("Geom tidak valid");
      }

      const query = `INSERT INTO river_line_drafts (geom) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)) RETURNING id`;
      try {
        const result = await client.query(query, [JSON.stringify(geom)]);
        const draftId = result.rows[0].id;
        return {
          success: true,
          message: "Draft garis sungai berhasil disimpan",
          draftId,
        };
      } catch (err) {
        throw new Error(`Gagal simpan draft: ${err.message}`);
      }
    },

    // --- 2. Simpan Draft Polygon ---
    savePolygonDraft: async (_, { geom }) => {
      if (!geom || geom.type !== "Polygon" || geom.coordinates[0].length < 4) {
        throw new Error("Polygon tidak valid");
      }

      const query = `INSERT INTO polygon_drafts (geom) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)) RETURNING id`;
      try {
        const result = await client.query(query, [JSON.stringify(geom)]);
        const draftId = result.rows[0].id;
        return {
          success: true,
          message: "Draft polygon berhasil disimpan",
          draftId,
        };
      } catch (err) {
        throw new Error(`Gagal simpan polygon draft: ${err.message}`);
      }
    },

    // --- 3. Proses Survey dari Draft Garis ---
    generateSurvey: async (_, { surveyId, riverLineDraftId, areaId, spasi, panjang }) => {
      if (!surveyId || !riverLineDraftId || !areaId || spasi <= 0 || panjang <= 0) {
        throw new Error("Parameter tidak valid");
      }

      const query = `SELECT * FROM generate_survey($1, $2, $3, $4, $5)`;
      try {
        const result = await client.query(query, [surveyId, riverLineDraftId, areaId, spasi, panjang]);
        if (result.rows.length > 0) {
          return {
            success: true,
            message: "Proses survey selesai",
            result: result.rows[0].generate_survey,
          };
        }
        throw new Error("Tidak ada hasil");
      } catch (err) {
        throw new Error(`Gagal proses survey: ${err.message}`);
      }
    },

    // --- 4. Proses Transek dari Draft Polygon ---
    generateTransekFromPolygon: async (_, { surveyId, polygonDraftId, lineCount, spacing }) => {
      if (!surveyId || !polygonDraftId || lineCount < 1 || spacing <= 0) {
        throw new Error("Parameter tidak valid");
      }

      const query = `SELECT * FROM generate_transek_from_polygon($1, $2, $3, $4)`;
      try {
        const result = await client.query(query, [surveyId, polygonDraftId, lineCount, spacing]);
        if (result.rows.length > 0) {
          return {
            success: true,
            message: "Proses transek dari polygon selesai",
            result: result.rows[0].generate_transek_from_polygon,
          };
        }
        throw new Error("Tidak ada hasil");
      } catch (err) {
        throw new Error(`Gagal proses transek dari polygon: ${err.message}`);
      }
    },

    // --- 5. Proses Survey dari GeoJSON (kompatibilitas lama) ---
    processSurveyWithLine: async (_, { surveyId, riverLine, areaId, spasi, panjang }) => {
      if (!surveyId || !riverLine || !areaId || spasi <= 0 || panjang <= 0) {
        throw new Error("Parameter tidak valid");
      }

      const query = `SELECT * FROM process_survey($1, $2, $3, $4, $5)`;
      try {
        const result = await client.query(query, [surveyId, riverLine, areaId, spasi, panjang]);
        if (result.rows.length > 0) {
          return {
            success: true,
            message: "Proses survey selesai",
            result: result.rows[0].process_survey,
          };
        }
        throw new Error("Tidak ada hasil");
      } catch (err) {
        throw new Error(`Gagal proses survey: ${err.message}`);
      }
    },
  },
};

export default resolvers;
