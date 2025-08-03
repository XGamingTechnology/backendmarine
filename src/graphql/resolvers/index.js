// src/graphql/resolvers/index.js
import { Client } from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
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

const JWT_SECRET = process.env.JWT_SECRET || "rahasia_tidak_boleh_dikasih_tahu";

// --- Fungsi bantu: pastikan angka valid ---
const isValidNumber = (value) => {
  // Terima string atau number, asal bisa jadi angka valid
  const num = parseFloat(value);
  return !isNaN(num) && isFinite(num);
};

const toNumber = (value) => {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

const resolvers = {
  Query: {
    spatialFeatures: async (_, { layerType, source }) => {
      let query = `
        SELECT 
          id, layer_type, name, description, 
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
      const query = `
        SELECT id, name, description, layer_type, source, metadata, group_id
        FROM layer_definitions
      `;
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
  },

  Mutation: {
    createSpatialFeature: async (_, { layerType, name, description, geometry, source, meta }) => {
      // 🔍 DEBUG: Log input mentah
      console.log("📥 [Resolver] Menerima geometry:", JSON.stringify(geometry, null, 2));
      console.log("📥 [Resolver] Type of coords:", typeof geometry?.coordinates?.[0], typeof geometry?.coordinates?.[1]);

      // ✅ Validasi dasar
      if (!layerType) throw new Error("layerType wajib diisi");
      if (!geometry) throw new Error("geometry tidak boleh null/undefined");
      if (typeof geometry !== "object") throw new Error("geometry harus object");
      if (!geometry.type || !geometry.coordinates) throw new Error("geometry tidak lengkap");

      // ✅ Validasi Point
      if (geometry.type === "Point") {
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2) {
          throw new Error("Koordinat Point harus array [lon, lat]");
        }

        const [rawLon, rawLat] = geometry.coordinates;

        // ✅ Validasi fleksibel: terima string atau number
        if (!isValidNumber(rawLon) || !isValidNumber(rawLat)) {
          console.error("❌ Koordinat tidak valid:", { rawLon, rawLat });
          throw new Error("Koordinat harus berupa angka [lon, lat]");
        }

        const lon = toNumber(rawLon);
        const lat = toNumber(rawLat);

        if (lon === null || lat === null) {
          throw new Error("Gagal konversi koordinat ke angka");
        }

        // ⚠️ Warning untuk (0,0)
        if (lon === 0 && lat === 0) {
          console.warn("⚠️ Koordinat (0,0) terdeteksi. Mungkin kesalahan input.");
        }

        // 🔁 Perbarui geometry dengan nilai number primitif
        geometry.coordinates = [lon, lat];
      }

      // ✅ Untuk LineString, Polygon, dll — validasi koordinat bersarang
      if (["LineString", "Polygon", "MultiPoint"].includes(geometry.type)) {
        const flattenCoords = geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat(Infinity);
        for (const coord of flattenCoords) {
          if (!isValidNumber(coord[0]) || !isValidNumber(coord[1])) {
            throw new Error("Semua koordinat harus berupa angka");
          }
        }
        // Opsional: normalisasi ke number primitif
        const normalize = (arr) => (Array.isArray(arr[0]) ? arr.map(normalize) : [toNumber(arr[0]), toNumber(arr[1])]);
        geometry.coordinates = normalize(geometry.coordinates);
      }

      const query = `
        INSERT INTO spatial_features (
          layer_type, name, description, geom, source, metadata
        ) VALUES (
          $1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6
        )
        RETURNING 
          id, layer_type, name, description, 
          ST_AsGeoJSON(geom)::json AS geometry,
          created_at, source, metadata
      `;

      try {
        // ✅ Pastikan geometry di-stringify setelah normalisasi
        const result = await client.query(query, [
          layerType,
          name || null,
          description || null,
          JSON.stringify(geometry), // ← sekarang [number, number]
          source || "manual",
          meta || {},
        ]);

        const row = result.rows[0];
        console.log("✅ [DB] Berhasil simpan feature:", row.id);
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
        console.error("❌ [Resolver] Error saat insert ke DB:", err.message);
        console.error("❌ [Resolver] Detail error:", err.stack);
        throw new Error(`Gagal menyimpan ke database: ${err.message}`);
      }
    },
  },
};

export default resolvers;
