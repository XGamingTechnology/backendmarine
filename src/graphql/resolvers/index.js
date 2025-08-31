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

// --- Fungsi: Haversine Distance (untuk akurasi) ---
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meter
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const resolvers = {
  Query: {
    // ✅ 1. spatialFeatures: Admin lihat semua, user lihat milik sendiri
    spatialFeatures: async (_, { layerType, source }, context) => {
      const user = context.user;
      console.log("🔍 Query: spatialFeatures");
      console.log("👤 User:", user ? `${user.id} (${user.role})` : "Tidak ada");
      console.log("FilterWhere:", { layerType, source });

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
          is_shared,
          survey_id  -- ✅ TAMBAHKAN INI!
        FROM spatial_features
        WHERE 
      `;
      const params = [];
      let paramCount = 1;

      if (user.role === "admin") {
        // ✅ Admin: lihat semua data
        console.log("✅ Role: admin → akses semua data");
      } else {
        // ✅ User biasa: hanya milik sendiri + shared
        query += "(is_shared = true OR user_id = $1)";
        params.push(user.id);
        console.log("✅ Role: user → filter user_id =", user.id);
      }

      if (layerType) {
        const clause = user.role === "admin" ? "$1" : `$${params.length + 1}`;
        query += (params.length > 0 ? " AND " : "") + `layer_type = ${clause}`;
        params.push(layerType);
        console.log("FilterWhere: layerType =", layerType);
      }

      if (source) {
        const clause = user.role === "admin" ? (layerType ? "$2" : "$1") : `$${params.length + 1}`;
        query += (params.length > 0 ? " AND " : "") + `source = ${clause}`;
        params.push(source);
        console.log("FilterWhere: source =", source);
      }

      try {
        console.log("📝 SQL Query:", query);
        console.log("📦 Params:", params);
        const result = await client.query(query, params);
        console.log("✅ Result count:", result.rows.length);

        const mapped = result.rows.map((row) => ({
          id: row.id,
          layerType: row.layer_type,
          name: row.name,
          description: row.description,
          geometry: row.geometry,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          source: row.source,
          meta: row.metadata,
          user_id: row.user_id,
          is_shared: row.is_shared,
        }));

        console.log("📤 Data dikembalikan:", mapped.length, "features");
        return mapped;
      } catch (err) {
        console.error("❌ Error fetching spatialFeatures:", err);
        throw new Error("Gagal ambil data");
      }
    },

    // ✅ 2. layerDefinitions: Tidak butuh user
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

    // ✅ 3. layerOptions: Admin lihat semua, user lihat milik sendiri
    layerOptions: async (_, { layerType }, context) => {
      const user = context.user;
      if (!user) throw new Error("Unauthorized");

      let query = `SELECT id, name, layer_type FROM spatial_features WHERE layer_type = $1`;
      const params = [layerType];

      if (user.role !== "admin") {
        query += ` AND (is_shared = true OR user_id = $2)`;
        params.push(user.id);
      }

      try {
        const result = await client.query(query, params);
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

    // ✅ 4. samplingPointsBySurveyId: Untuk simulasi (butuh transect line)
    samplingPointsBySurveyId: async (_, { surveyId }, context) => {
      const user = context.user;
      console.log("🔍 Query: samplingPointsBySurveyId");
      console.log("🆔 surveyId:", surveyId);
      console.log("👤 User:", user ? `${user.id} (${user.role})` : "Tidak ada");

      if (!user) throw new Error("Unauthorized");

      const query = `
        WITH transect_line AS (
          SELECT geom AS line_geom
          FROM spatial_features
          WHERE 
            layer_type = 'valid_transect_line'
            AND metadata->>'survey_id' = $1
            ${user.role === "admin" ? "" : "AND user_id = $2"}
          LIMIT 1
        ),
        sampling_points AS (
          SELECT 
            id,
            layer_type,
            name,
            description,
            geom AS point_geom,
            metadata,
            ST_AsGeoJSON(geom)::json AS geometry_json
          FROM spatial_features 
          WHERE 
            layer_type = 'valid_sampling_point'
            AND metadata->>'survey_id' = $1
            ${user.role === "admin" ? "" : "AND user_id = $2"}
        )
        SELECT 
          sp.id,
          sp.layer_type,
          sp.name,
          sp.description,
          sp.geometry_json AS geometry,
          sp.metadata,
          -- Jarak sepanjang transect
          ROUND(
            (ST_LineLocatePoint(tl.line_geom, sp.point_geom) * ST_Length(tl.line_geom::geography))::numeric,
            2
          ) AS distance_from_start,
          -- Ambil offset_m dari metadata (sudah dihitung di generate_survey)
          (sp.metadata->>'offset_m')::DOUBLE PRECISION AS offset_m,
          -- Kedalaman
          COALESCE(
            (sp.metadata->>'depth_value')::DOUBLE PRECISION,
            (sp.metadata->>'kedalaman')::DOUBLE PRECISION,
            0
          ) AS depth_value
        FROM sampling_points sp
        CROSS JOIN transect_line tl
        ORDER BY distance_from_start;
      `;

      try {
        const params = [surveyId, user.role === "admin" ? null : user.id];
        console.log("📝 SQL Query:", query);
        console.log("📦 Params:", params);

        const result = await client.query(query, params);
        console.log("✅ Result count:", result.rows.length);

        return result.rows.map((row) => {
          const meta = { ...row.metadata };

          // ✅ Tambah field yang sudah dihitung
          meta.distance_m = parseFloat(row.distance_from_start);
          meta.offset_m = parseFloat(row.offset_m); // ← dari backend
          meta.depth_value = -Math.abs(parseFloat(row.depth_value)); // kedalaman negatif

          return {
            id: row.id,
            layerType: row.layer_type,
            name: row.name,
            description: row.description,
            geometry: row.geometry,
            meta: meta,
          };
        });
      } catch (err) {
        console.error("❌ Gagal ambil samplingPointsBySurveyId:", err);
        throw new Error("Gagal ambil data sampling. Pastikan transect line ada.");
      }
    },

    // ✅ 5. fieldSurveyPointsBySurveyId: Untuk data lapangan (pakai sequence)
    fieldSurveyPointsBySurveyId: async (_, { surveyId }, context) => {
      const user = context.user;
      console.log("🔍 Query: fieldSurveyPointsBySurveyId");
      console.log("🆔 surveyId:", surveyId);
      console.log("👤 User:", user ? `${user.id} (${user.role})` : "Tidak ada");

      if (!user) throw new Error("Unauthorized");

      const query = `
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
          ST_X(geom::geometry) AS lon,
          ST_Y(geom::geometry) AS lat
        FROM spatial_features 
        WHERE 
          layer_type = 'valid_sampling_point'
          AND metadata->>'survey_id' = $1
          AND user_id = $2
          AND (metadata ? 'sequence')
        ORDER BY (metadata->>'sequence')::int;
      `;

      try {
        const params = [surveyId, user.id];
        console.log("📝 SQL Query:", query);
        console.log("📦 Params:", params);

        const result = await client.query(query, params);
        console.log("✅ Result count:", result.rows.length);
        if (result.rows.length === 0) {
          console.warn("⚠️ Tidak ada titik ditemukan untuk surveyId:", surveyId);
          console.warn("🔍 Cek: apakah metadata->>'survey_id' benar?");
          console.warn("🔍 Cek: apakah user_id =", user.id);
          console.warn("🔍 Cek: apakah ada metadata ? 'sequence'");
        }

        let cumulativeDistance = 0;
        const points = result.rows.map((row, i) => {
          const meta = { ...row.metadata };

          if (i === 0) {
            meta.distance_m = 0;
          } else {
            const prev = result.rows[i - 1];
            const distance = haversineDistance(prev.lat, prev.lon, row.lat, row.lon);
            cumulativeDistance += distance;
            meta.distance_m = cumulativeDistance;
          }

          if (meta.kedalaman !== undefined) {
            meta.kedalaman = -Math.abs(parseFloat(meta.kedalaman));
          }
          if (meta.depth_value !== undefined) {
            meta.depth_value = -Math.abs(parseFloat(meta.depth_value));
          }

          return {
            id: row.id,
            layerType: row.layer_type,
            name: row.name,
            description: row.description,
            geometry: row.geometry,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            source: row.source,
            meta: meta,
            user_id: row.user_id,
            is_shared: row.is_shared,
          };
        });

        console.log("📤 Titik dikembalikan:", points.length);
        return points;
      } catch (err) {
        console.error("❌ Gagal ambil fieldSurveyPointsBySurveyId:", err);
        throw new Error("Gagal ambil data survey lapangan.");
      }
    },

    // ✅ 6. simulatedPointsBySurveyId: Alternatif tanpa transect line
    simulatedPointsBySurveyId: async (_, { surveyId }, context) => {
      const user = context.user;
      console.log("🔍 Query: simulatedPointsBySurveyId");
      console.log("🆔 surveyId:", surveyId);
      console.log("👤 User:", user ? `${user.id} (${user.role})` : "Tidak ada");

      if (!user) throw new Error("Unauthorized");

      const query = `
        SELECT 
          id,
          layer_type,
          name,
          description,
          ST_AsGeoJSON(geom)::json AS geometry,
          metadata,
          source
        FROM spatial_features 
        WHERE 
          layer_type = 'valid_sampling_point'
          AND (
            metadata->>'survey_id' = $1 
            OR name = $1
          )
          ${user.role === "admin" ? "" : "AND user_id = $2"}
      `;

      try {
        const params = [surveyId, user.role === "admin" ? null : user.id];
        console.log("📝 SQL Query:", query);
        console.log("📦 Params:", params);

        const result = await client.query(query, params);
        console.log("✅ Result count:", result.rows.length);

        return result.rows.map((row) => {
          const meta = { ...row.metadata };

          // Ambil jarak dari metadata atau default
          const distance = parseFloat(meta.distance_m ?? meta.jarak ?? 0);
          const depth = parseFloat(meta.depth_value ?? meta.kedalaman ?? 0);

          // Tambah field yang dibutuhkan
          meta.distance_m = distance;
          meta.offset_m = parseFloat(meta.offset_m ?? 0);
          meta.depth_value = -Math.abs(depth);

          return {
            id: row.id,
            layerType: row.layer_type,
            name: row.name,
            description: row.description,
            geometry: row.geometry,
            meta: meta,
          };
        });
      } catch (err) {
        console.error("❌ Gagal ambil simulatedPointsBySurveyId:", err);
        throw new Error("Gagal ambil data titik simulasi.");
      }
    },
  },

  Mutation: {
    // ✅ 1. createSpatialFeature: Semua user bisa buat
    createSpatialFeature: async (_, { layerType, name, description, geometry, source, meta }, context) => {
      const user = context.user;
      if (!user) throw new Error("Unauthorized");

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
          meta: row.metadata,
        };
      } catch (err) {
        console.error("❌ Error saat insert ke DB:", err);
        throw new Error(`Gagal menyimpan: ${err.message}`);
      }
    },

    // ✅ 2. updateSpatialFeature: Admin bisa edit semua
    updateSpatialFeature: async (_, { id, name, description, geometry, source, meta }, context) => {
      const user = context.user;
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

      values.push(id);
      if (user.role !== "admin") {
        values.push(user.id);
      }

      const userCondition = user.role === "admin" ? "" : "AND user_id = $2";
      const query = `
        UPDATE spatial_features 
        SET ${fields.join(", ")}, updated_at = NOW()
        WHERE id = $1 ${userCondition}
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

    // ✅ 3. deleteSpatialFeature: Admin bisa hapus semua
    deleteSpatialFeature: async (_, { id }, context) => {
      const user = context.user;
      if (!user) throw new Error("Unauthorized");

      const userCondition = user.role === "admin" ? "" : "AND user_id = $2";
      const query = `DELETE FROM spatial_features WHERE id = $1 ${userCondition} RETURNING id`;

      try {
        const result = await client.query(query, [id, user.role === "admin" ? null : user.id]);
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

    // ✅ 4. saveRiverLineDraft: Admin bisa simpan untuk semua user
    saveRiverLineDraft: async (_, { geom }, context) => {
      const user = context.user;
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

    // ✅ 5. savePolygonDraft: Admin bisa simpan untuk semua user
    savePolygonDraft: async (_, { geom }, context) => {
      const user = context.user;
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

    // ✅ 6. generateSurvey: Admin bisa generate untuk semua
    generateSurvey: async (_, { surveyId, riverLineDraftId, areaId, spasi, panjang }, context) => {
      const user = context.user;
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

    // ✅ 7. generateTransekFromPolygonByDraft: Admin bisa akses semua draft
    generateTransekFromPolygonByDraft: async (_, { surveyId, polygonDraftId, lineCount, pointCount, fixedSpacing }, context) => {
      const user = context.user;
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

    // ✅ 8. processSurveyWithLine: Admin bisa proses semua
    processSurveyWithLine: async (_, { surveyId, riverLine, areaId, spasi, panjang }, context) => {
      const user = context.user;
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

    // ✅ 9. deleteSurveyResults: Admin bisa hapus hasil survey dari user lain
    deleteSurveyResults: async (_, { surveyId }, context) => {
      const user = context.user;
      if (!user) throw new Error("Unauthorized");

      const userCondition = user.role === "admin" ? "" : "AND user_id = $2";
      const query = `
        DELETE FROM spatial_features 
        WHERE metadata->>'survey_id' = $1 
          ${userCondition}
          AND layer_type IN ('valid_transect_line', 'valid_sampling_point')
        RETURNING id
      `;
      try {
        const result = await client.query(query, [surveyId, user.role === "admin" ? null : user.id]);
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
