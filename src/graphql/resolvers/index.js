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

// --- Middleware: Ekstrak user dari token ---
const getUserFromContext = (context) => {
  const authHeader = context.req?.headers?.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      return { id: payload.userId, role: payload.role };
    } catch (e) {
      return null;
    }
  }
  return null;
};

const resolvers = {
  Query: {
    // ✅ 1. spatialFeatures: Bisa akses shared + milik user
    spatialFeatures: async (_, { layerType, source }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      let query = `
        SELECT 
          id, 
          layer_type, 
          name, 
          description, 
          ST_AsGeoJSON(geom)::json AS geometry, 
          created_at, 
          updated_at, 
          source, 
          metadata, 
          user_id, 
          is_shared
        FROM spatial_features
        WHERE (is_shared = true OR user_id = $1)
      `;
      const params = [user.id];
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
        query += " AND " + whereClause.join(" AND ");
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
          source: row.source,
          meta: row.metadata, // ✅ Harus sama dengan metadata dari DB
          user_id: row.user_id,
          is_shared: row.is_shared,
        }));
      } catch (err) {
        console.error("Error fetching spatialFeatures:", err);
        throw new Error("Gagal ambil data");
      }
    },

    // ✅ 2. layerDefinitions: Tidak perlu user_id
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

    // ✅ 3. layerOptions: Filter per user
    layerOptions: async (_, { layerType }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      const query = `SELECT id, name, layer_type FROM spatial_features WHERE layer_type = $1 AND (is_shared = true OR user_id = $2) ORDER BY name`;
      try {
        const result = await client.query(query, [layerType, user.id]);
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

    // ✅ 4. samplingPointsBySurveyId: Filter per user
    samplingPointsBySurveyId: async (_, { surveyId }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      const query = `
        SELECT 
          id,
          layer_type,
          name,
          description,
          ST_AsGeoJSON(geom)::json AS geometry,
          metadata
        FROM spatial_features 
        WHERE layer_type = 'valid_sampling_point'
          AND metadata->>'survey_id' = $1
          AND user_id = $2
      `;
      try {
        const result = await client.query(query, [surveyId, user.id]);
        return result.rows.map((row) => ({
          id: row.id,
          layerType: row.layer_type,
          name: row.name,
          description: row.description,
          geometry: row.geometry,
          meta: row.metadata,
        }));
      } catch (err) {
        console.error("❌ Gagal ambil samplingPointsBySurveyId:", err);
        throw new Error("Gagal ambil data sampling");
      }
    },
  },

  Mutation: {
    // ✅ 1. createSpatialFeature: Simpan user_id
    createSpatialFeature: async (_, { layerType, name, description, geometry, source, meta }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      if (!layerType || !geometry || typeof geometry !== "object") throw new Error("Data tidak valid");

      // Normalisasi geometri
      if (geometry.type === "Point") {
        const [rawLon, rawLat] = geometry.coordinates;
        if (!isValidNumber(rawLon) || !isValidNumber(rawLat)) throw new Error("Koordinat tidak valid");
        geometry.coordinates = [toNumber(rawLon), toNumber(rawLat)];
      }

      if (["LineString", "Polygon"].includes(geometry.type)) {
        const normalize = (arr) => (Array.isArray(arr[0]) ? arr.map(normalize) : [toNumber(arr[0]), toNumber(arr[1])]);
        geometry.coordinates = normalize(geometry.coordinates);
      }

      // ✅ Pastikan meta tidak null/undefined
      const safeMeta = meta ? { ...meta } : {};

      const query = `
        INSERT INTO spatial_features (layer_type, name, description, geom, source, metadata, user_id, is_shared)
        VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6, $7, false)
        RETURNING 
          id, 
          layer_type, 
          name, 
          description, 
          ST_AsGeoJSON(geom)::json AS geometry, 
          created_at, 
          source, 
          metadata
      `;

      try {
        const result = await client.query(query, [layerType, name || null, description || null, JSON.stringify(geometry), source || "manual", safeMeta, user.id]);

        const row = result.rows[0];
        return {
          id: row.id,
          layerType: row.layer_type,
          name: row.name,
          description: row.description,
          geometry: row.geometry,
          createdAt: row.created_at,
          source: row.source,
          meta: row.metadata, // ✅ Ini harus berisi icon dan category
        };
      } catch (err) {
        console.error("❌ Error saat insert ke DB:", err);
        throw new Error(`Gagal menyimpan: ${err.message}`);
      }
    },

    // ✅ 2. updateSpatialFeature: Cek user_id
    updateSpatialFeature: async (_, { id, name, description, geometry, source, meta }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      const fields = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        fields.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (description !== undefined) {
        fields.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (geometry) {
        fields.push(`geom = ST_SetSRID(ST_GeomFromGeoJSON($${paramCount++}), 4326)`);
        values.push(JSON.stringify(geometry));
      }
      if (source !== undefined) {
        fields.push(`source = $${paramCount++}`);
        values.push(source);
      }
      if (meta !== undefined) {
        fields.push(`metadata = $${paramCount++}`);
        values.push(meta ? { ...meta } : {});
      }

      if (fields.length === 0) {
        throw new Error("Tidak ada field untuk diupdate");
      }

      values.push(id, user.id);
      paramCount = values.length;

      const query = `
        UPDATE spatial_features 
        SET ${fields.join(", ")}, updated_at = NOW()
        WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
        RETURNING 
          id, 
          layer_type, 
          name, 
          description, 
          ST_AsGeoJSON(geom)::json AS geometry, 
          created_at, 
          updated_at, 
          source, 
          metadata
      `;

      try {
        const result = await client.query(query, values);
        if (result.rows.length === 0) {
          throw new Error("Tidak punya izin edit atau data tidak ditemukan");
        }
        const row = result.rows[0];
        return {
          id: row.id,
          layerType: row.layer_type,
          name: row.name,
          description: row.description,
          geometry: row.geometry,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          source: row.source,
          meta: row.metadata,
        };
      } catch (err) {
        console.error("❌ Gagal update feature:", err);
        throw new Error(`Gagal update: ${err.message}`);
      }
    },

    // ✅ 3. deleteSpatialFeature: Return MutationResponse
    deleteSpatialFeature: async (_, { id }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      const query = `DELETE FROM spatial_features WHERE id = $1 AND user_id = $2 RETURNING id`;
      try {
        const result = await client.query(query, [id, user.id]);
        if (result.rows.length === 0) {
          return {
            success: false,
            message: "Tidak punya izin hapus atau data tidak ditemukan",
          };
        }
        return {
          success: true,
          message: "Feature berhasil dihapus",
        };
      } catch (err) {
        console.error("❌ Gagal hapus feature:", err);
        return {
          success: false,
          message: `Gagal hapus: ${err.message}`,
        };
      }
    },

    // ✅ 4. saveRiverLineDraft: Simpan user_id
    saveRiverLineDraft: async (_, { geom }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      if (!geom || geom.type !== "LineString" || geom.coordinates.length < 2) {
        throw new Error("Geom tidak valid");
      }

      const query = `INSERT INTO river_line_drafts (geom, user_id) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326), $2) RETURNING id`;
      try {
        const result = await client.query(query, [JSON.stringify(geom), user.id]);
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

    // ✅ 5. savePolygonDraft: Simpan user_id
    savePolygonDraft: async (_, { geom }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      if (!geom || geom.type !== "Polygon" || geom.coordinates[0].length < 4) {
        throw new Error("Polygon tidak valid");
      }

      const query = `INSERT INTO polygon_drafts (geom, user_id) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326), $2) RETURNING id`;
      try {
        const result = await client.query(query, [JSON.stringify(geom), user.id]);
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

    // ✅ 6. generateSurvey: Kirim user_id ke DB
    generateSurvey: async (_, { surveyId, riverLineDraftId, areaId, spasi, panjang }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      if (!surveyId || !riverLineDraftId || !areaId || spasi <= 0 || panjang <= 0) {
        throw new Error("Parameter tidak valid");
      }

      const query = `SELECT * FROM generate_survey($1, $2, $3, $4, $5, $6)`;
      try {
        const result = await client.query(query, [surveyId, riverLineDraftId, areaId, spasi, panjang, user.id]);
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

    // ✅ 7. generateTransekFromPolygonByDraft: Kirim user_id
    generateTransekFromPolygonByDraft: async (_, { surveyId, polygonDraftId, lineCount, pointCount, fixedSpacing }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      if (!surveyId || !polygonDraftId) {
        return {
          success: false,
          message: "Parameter surveyId dan polygonDraftId wajib diisi",
        };
      }

      const countArgs = [lineCount, pointCount, fixedSpacing].filter((x) => x !== null && x !== undefined).length;
      if (countArgs === 0) {
        return {
          success: false,
          message: "Harus set lineCount, pointCount, atau fixedSpacing",
        };
      }
      if (countArgs > 1) {
        return {
          success: false,
          message: "Hanya boleh set satu dari: lineCount, pointCount, fixedSpacing",
        };
      }

      const query = `SELECT * FROM generate_transek_from_polygon_by_draft($1, $2, $3, $4, $5, $6)`;
      try {
        const result = await client.query(query, [surveyId, polygonDraftId, lineCount || null, pointCount || null, fixedSpacing || null, user.id]);

        if (result.rows.length > 0) {
          const dbResult = result.rows[0].generate_transek_from_polygon_by_draft;
          return {
            success: dbResult.success,
            message: dbResult.message,
          };
        }
        return {
          success: false,
          message: "Tidak ada hasil dari fungsi DB",
        };
      } catch (err) {
        console.error("❌ Gagal proses transek dari polygon:", err);
        return {
          success: false,
          message: `Gagal proses transek dari polygon: ${err.message}`,
        };
      }
    },

    // ✅ 8. processSurveyWithLine: Kirim user_id
    processSurveyWithLine: async (_, { surveyId, riverLine, areaId, spasi, panjang }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      if (!surveyId || !riverLine || !areaId || spasi <= 0 || panjang <= 0) {
        throw new Error("Parameter tidak valid");
      }

      const query = `SELECT * FROM process_survey($1, $2, $3, $4, $5, $6)`;
      try {
        const result = await client.query(query, [surveyId, riverLine, areaId, spasi, panjang, user.id]);
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

    // ✅ 9. deleteSurveyResults: Hapus semua hasil berdasarkan surveyId
    deleteSurveyResults: async (_, { surveyId }, context) => {
      const user = getUserFromContext(context);
      if (!user) throw new Error("Unauthorized");

      const query = `
        DELETE FROM spatial_features 
        WHERE metadata->>'survey_id' = $1 
          AND user_id = $2
          AND layer_type IN ('valid_transect_line', 'valid_sampling_point')
        RETURNING id
      `;
      try {
        const result = await client.query(query, [surveyId, user.id]);
        return {
          success: true,
          message: `Berhasil hapus ${result.rows.length} feature dari survey ${surveyId}`,
        };
      } catch (err) {
        console.error("❌ Gagal hapus hasil survey:", err);
        return {
          success: false,
          message: "Gagal hapus hasil survey",
        };
      }
    },
  },
};

export default resolvers;
