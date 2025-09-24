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
      console.log("<tool_call><tool_call>FilterWhere:", { layerType, source });

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
          survey_id
        FROM spatial_features
        WHERE 
      `;
      const params = [];
      let paramCount = 1;

      if (user.role === "admin") {
        console.log("✅ Role: admin → akses semua data");
      } else {
        query += "(is_shared = true OR user_id = $1)";
        params.push(user.id);
        console.log("✅ Role: user → filter user_id =", user.id);
      }

      if (layerType) {
        const clause = user.role === "admin" ? "$1" : `$${params.length + 1}`;
        query += (params.length > 0 ? " AND " : "") + `layer_type = ${clause}`;
        params.push(layerType);
        console.log("<tool_call><tool_call> layerType =", layerType);
      }

      if (source) {
        const clause = user.role === "admin" ? (layerType ? "$2" : "$1") : `$${params.length + 1}`;
        query += (params.length > 0 ? " AND " : "") + `source = ${clause}`;
        params.push(source);
        console.log("<tool_call><tool_call> source =", source);
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

    // ✅ 4. samplingPointsBySurveyId: Bisa baca dari metadata ATAU kolom survey_id
    samplingPointsBySurveyId: async (_, { surveyId }, context) => {
      const user = context.user;
      console.log("🔍 Query: samplingPointsBySurveyId");
      console.log("🆔 surveyId:", surveyId);
      console.log("👤 User:", user ? `${user.id} (${user.role})` : "Tidak ada");

      if (!user) throw new Error("Unauthorized");

      // --- Coba ambil dengan transect_line dulu ---
      const queryWithTransect = `
        WITH transect_line AS (
          SELECT geom AS line_geom
          FROM spatial_features
          WHERE 
            layer_type = 'valid_transect_line'
            AND (
              metadata->>'survey_id' = $1 
              OR survey_id = $1
            )
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
            AND (
              metadata->>'survey_id' = $1 
              OR survey_id = $1
            )
            ${user.role === "admin" ? "" : "AND user_id = $2"}
        )
        SELECT 
          sp.id,
          sp.layer_type,
          sp.name,
          sp.description,
          sp.geometry_json AS geometry,
          sp.metadata,
          ROUND(
            (ST_LineLocatePoint(tl.line_geom, sp.point_geom) * ST_Length(tl.line_geom::geography))::numeric,
            2
          ) AS distance_from_start,
          (sp.metadata->>'offset_m')::DOUBLE PRECISION AS offset_m_raw,
          COALESCE(
            (sp.metadata->>'depth_value')::DOUBLE PRECISION,
            (sp.metadata->>'kedalaman')::DOUBLE PRECISION,
            0
          ) AS depth_value_raw
        FROM sampling_points sp
        CROSS JOIN transect_line tl
        ORDER BY distance_from_start;
      `;

      try {
        const params = [surveyId, user.role === "admin" ? null : user.id];
        const result = await client.query(queryWithTransect, params);

        if (result.rows.length > 0) {
          console.log("✅ Data ditemukan dengan transect_line:", result.rows.length, "titik");
          return result.rows.map((row) => {
            const meta = { ...row.metadata } || {};

            meta.distance_m = parseFloat(row.distance_from_start);
            meta.offset_m = parseFloat(row.offset_m_raw) || 0;
            meta.depth_value = -Math.abs(parseFloat(row.depth_value_raw));

            return {
              id: row.id,
              layerType: row.layer_type,
              name: row.name,
              description: row.description,
              geometry: row.geometry,
              meta: meta,
            };
          });
        }
      } catch (err) {
        console.warn("⚠️ Gagal ambil dengan transect_line:", err.message);
      }

      // --- Fallback: ambil tanpa transect_line ---
      console.log("🔁 Fallback ke data mentah (tanpa transect_line)");
      const queryFallback = `
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
            OR survey_id = $1
          )
          ${user.role === "admin" ? "" : "AND user_id = $2"}
      `;

      try {
        const params = [surveyId, user.role === "admin" ? null : user.id];
        const result = await client.query(queryFallback, params);
        console.log("✅ Fallback: Data ditemukan tanpa transect_line:", result.rows.length, "titik");

        return result.rows.map((row) => {
          const meta = { ...row.metadata } || {};

          const distance = parseFloat(meta.distance_m ?? 0);
          const offset = parseFloat(meta.offset_m ?? 0);
          const depth = parseFloat(meta.depth_value ?? meta.kedalaman ?? 0);

          meta.distance_m = distance;
          meta.offset_m = offset;
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
        console.error("❌ Gagal ambil data simulasi (fallback):", err);
        throw new Error("Gagal ambil data titik. Cek apakah titik ada di database.");
      }
    },

    // ✅ 5. fieldSurveyPointsBySurveyId: Untuk data lapangan (pakai sequence) — DIPERBAIKI
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
          layer_type IN ('valid_sampling_point', 'echosounder_point')  // ✅ Dua layer
          AND metadata->>'survey_id' = $1
          AND user_id = $2
        ORDER BY 
          CASE 
            WHEN layer_type = 'valid_sampling_point' THEN (metadata->>'sequence')::int 
            ELSE id 
          END;
      `;

      try {
        const params = [surveyId, user.id];
        console.log("📝 SQL Query:", query);
        console.log("📦 Params:", params);

        const result = await client.query(query, params);
        console.log("✅ Result count:", result.rows.length);
        if (result.rows.length === 0) {
          console.warn("⚠️ Tidak ada titik ditemukan untuk surveyId:", surveyId);
          console.warn("🔍 Cek: metadata->>'survey_id'?");
          console.warn("🔍 Cek: user_id =", user.id);
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

          const distance = parseFloat(meta.distance_m ?? meta.jarak ?? 0);
          const depth = parseFloat(meta.depth_value ?? meta.kedalaman ?? 0);

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

    // ✅ 7. batimetriLayersBySurveyId: Ambil kontur & permukaan batimetri berdasarkan surveyId
    batimetriLayersBySurveyId: async (_, { surveyId }, context) => {
      const user = context.user;
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
          layer_type IN ('kontur_batimetri', 'permukaan_batimetri')
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
          source: row.source,
        }));
      } catch (err) {
        console.error("❌ Gagal ambil batimetri layers:", err);
        throw new Error("Gagal ambil data batimetri.");
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

    // ✅ 7. generateTransekFromPolygonByDraft: Router ke fungsi yang tepat
    generateTransekFromPolygonByDraft: async (_, { surveyId, polygonDraftId, lineCount, pointCount, fixedSpacing, centerlineGeom, mode }, context) => {
      const user = context.user;
      if (!user) throw new Error("Unauthorized");

      if (!surveyId || !polygonDraftId) {
        return {
          success: false,
          message: "Parameter surveyId dan polygonDraftId wajib diisi",
        };
      }

      // Validasi mode
      const validModes = ["snake", "zigzag", "parallel"];
      if (mode && !validModes.includes(mode)) {
        return {
          success: false,
          message: `Mode tidak valid. Pilih: ${validModes.join(", ")}`,
        };
      }

      // Default mode
      const finalMode = mode || (centerlineGeom ? "parallel" : "snake");

      // Validasi parameter
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

      try {
        let result;

        if (finalMode === "parallel") {
          // ✅ Panggil fungsi PARALLEL — dengan ST_GeomFromGeoJSON
          console.log("🚀 Mode: PARALLEL — memanggil generate_transek_polygon_parallel (7 params)");
          const query = `
            SELECT generate_transek_polygon_parallel(
              $1::TEXT,          -- surveyId
              $2::INTEGER,       -- polygonDraftId
              $3::INTEGER,       -- lineCount
              $4::INTEGER,       -- pointCount
              $5::FLOAT,         -- fixedSpacing
              $6::INTEGER,       -- userId
              ST_GeomFromGeoJSON($7)  -- ✅ PERBAIKAN UTAMA — centerlineGeom (bisa NULL)
            ) AS result
          `;

          // Konversi centerlineGeom dari GeoJSON ke string
          let centerlineWKT = null;
          if (centerlineGeom) {
            if (centerlineGeom.type === "LineString" && Array.isArray(centerlineGeom.coordinates)) {
              centerlineWKT = JSON.stringify(centerlineGeom);
            } else {
              return {
                success: false,
                message: "CenterlineGeom tidak valid. Harus berupa LineString GeoJSON.",
              };
            }
          }

          const params = [
            surveyId,
            polygonDraftId,
            lineCount || null,
            pointCount || null,
            fixedSpacing || null,
            user.id,
            centerlineWKT, // <-- Parameter ke-7
          ];

          console.log("📦 Params untuk generate_transek_polygon_parallel:", params);

          const pgResult = await client.query(query, params);
          result = pgResult.rows[0].result;
        } else {
          // ✅ Panggil fungsi ZIGZAG/SNAKE
          console.log("🚀 Mode: SNAKE/ZIGZAG — memanggil generate_transek_from_polygon_by_draft");
          const query = `
            SELECT generate_transek_from_polygon_by_draft(
              $1::TEXT,
              $2::INTEGER,
              $3::INTEGER,
              $4::INTEGER,
              $5::FLOAT,
              $6::INTEGER,
              $7::TEXT
            ) AS result
          `;

          const params = [
            surveyId,
            polygonDraftId,
            lineCount || null,
            pointCount || null,
            fixedSpacing || null,
            user.id,
            finalMode, // 'snake' atau 'zigzag'
          ];

          const pgResult = await client.query(query, params);
          result = pgResult.rows[0].result;
        }

        if (!result.success) {
          return {
            success: false,
            message: result.message || "Proses gagal di database",
          };
        }

        return {
          success: true,
          message: result.message || "Proses transek selesai",
        };
      } catch (err) {
        console.error(`❌ [${finalMode.toUpperCase()}] Error:`, err);
        return {
          success: false,
          message: `Gagal proses transek (${finalMode}): ${err.message}`,
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

    // ✅ 10. generateBatimetriFromSamplingPoints: Generate kontur & batimetri dari titik sampling — DIPERBAIKI
    generateBatimetriFromSamplingPoints: async (_, { surveyId }, context) => {
      const user = context.user;
      if (!user) {
        console.warn("❌ Unauthorized access to generateBatimetriFromSamplingPoints");
        return {
          success: false,
          message: "Unauthorized",
        };
      }

      if (!surveyId) {
        console.warn("❌ Parameter surveyId tidak diberikan");
        return {
          success: false,
          message: "Parameter surveyId wajib diisi",
        };
      }

      console.log(`🚀 Memulai generate batimetri untuk surveyId: ${surveyId}, userId: ${user.id}`);

      try {
        // ✅ PERBAIKAN UTAMA: Ganti "properties" → "metadata"
        const checkQuery = `
      SELECT COUNT(*) as count
      FROM spatial_features
      WHERE layer_type = 'valid_sampling_point'
        AND (metadata->>'survey_id' = $1 OR survey_id = $1)
        AND user_id = $2
    `;
        const checkResult = await client.query(checkQuery, [surveyId, user.id]);
        const pointCount = parseInt(checkResult.rows[0].count);

        if (pointCount === 0) {
          console.warn(`⚠️ Tidak ada titik sampling ditemukan untuk surveyId: ${surveyId}`);
          return {
            success: false,
            message: `Tidak ada titik sampling ditemukan untuk survey ID: ${surveyId}`,
          };
        }

        console.log(`✅ Ditemukan ${pointCount} titik sampling — melanjutkan generate...`);

        // ✅ Panggil function PostGIS
        const query = `
      SELECT generate_batimetri_from_sampling_points($1, $2) AS result
    `;
        const result = await client.query(query, [surveyId, user.id]);

        if (result.rows.length === 0) {
          console.error("❌ Function PostGIS tidak mengembalikan hasil");
          return {
            success: false,
            message: "Function generate gagal — tidak ada hasil dari database",
          };
        }

        const pgResult = result.rows[0].result;

        if (!pgResult || typeof pgResult !== "object") {
          console.error("❌ Hasil dari function PostGIS tidak valid:", pgResult);
          return {
            success: false,
            message: "Hasil generate tidak valid — cek function PostGIS",
          };
        }

        if (!pgResult.success) {
          console.error("❌ Function PostGIS melaporkan error:", pgResult.message);
          return {
            success: false,
            message: pgResult.message || "Gagal generate batimetri di database",
          };
        }

        console.log("✅ Batimetri berhasil digenerate di PostGIS");
        return {
          success: true,
          message: pgResult.message || "Kontur dan batimetri berhasil digenerate",
        };
      } catch (err) {
        console.error("🔥 Error saat generate batimetri:", err);
        return {
          success: false,
          message: `Gagal generate: ${err.message}`,
        };
      }
    },

    // ❌ 11. generateTransectsFromPolygonAndLine: TIDAK DIGUNAKAN LAGI — bisa dihapus
    // Karena fungsionalitasnya sudah digantikan oleh generate_transek_polygon_parallel
    // Tapi tetap saya biarkan untuk backward compatibility
    generateTransectsFromPolygonAndLine: async (_, { polygon, line, mode, interval, jumlah, panjangTransek }, context) => {
      const user = context.user;
      if (!user) throw new Error("Unauthorized");

      if (!polygon || !line || !mode || !panjangTransek) {
        throw new Error("Parameter tidak valid");
      }

      if (mode !== "interval" && mode !== "jumlah") {
        throw new Error("Mode harus 'interval' atau 'jumlah'");
      }

      if (mode === "interval" && (!interval || interval <= 0)) {
        throw new Error("Interval harus > 0");
      }

      if (mode === "jumlah" && (!jumlah || jumlah < 2)) {
        throw new Error("Jumlah transek harus >= 2");
      }

      try {
        const query = `
          SELECT generate_transects_from_polygon_and_line($1, $2, $3, $4, $5, $6) as transects
        `;
        const result = await client.query(query, [JSON.stringify(polygon), JSON.stringify(line), mode, interval || null, jumlah || null, panjangTransek]);
        const transects = result.rows[0].transects;

        return {
          success: true,
          message: "Transek berhasil digenerate",
          transects: transects,
        };
      } catch (err) {
        console.error("❌ Gagal generate transek:", err);
        throw new Error(`Gagal generate transek: ${err.message}`);
      }
    },
  },
};

export default resolvers;
