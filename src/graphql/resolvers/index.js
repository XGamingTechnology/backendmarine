// src/graphql/resolvers/index.js
import { Client } from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Konfigurasi koneksi PostgreSQL
const client = new Client({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "webgis_sungai_musi",
});

// Koneksi ke database
client
  .connect()
  .then(() => {
    console.log("✅ Connected to PostgreSQL");
  })
  .catch((err) => {
    console.error("❌ Gagal koneksi ke PostgreSQL:", err.message);
  });

// Secret JWT
const JWT_SECRET = process.env.JWT_SECRET || "rahasia_tidak_boleh_dikasih_tahu";

// Resolvers
const resolvers = {
  Query: {
    // 🔹 Ambil semua spatial features
    spatialFeatures: async (_, { layerType, source }) => {
      let query = `
        SELECT 
          id, layer_type, name, description, 
          ST_AsGeoJSON(geom)::json AS geometry, 
          created_at, updated_at, created_by, source, metadata
        FROM spatial_features
      `;
      const params = [];
      let whereClause = [];

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
          ...row,
          layerType: row.layer_type || "unknown",
          geometry: row.geometry,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          createdBy: row.created_by,
          meta: row.metadata, // ✅ meta, bukan metadata
        }));
      } catch (err) {
        console.error("Error fetching spatialFeatures:", err);
        throw new Error("Gagal ambil data spatial features");
      }
    },

    // 🔹 Ambil semua cross sections
    crossSections: async () => {
      const query = `
        SELECT 
          id, station_name, station_value, river_id,
          ST_AsGeoJSON(location_point)::json AS locationPoint,
          created_at, created_by, notes
        FROM cross_sections
      `;
      try {
        const result = await client.query(query);
        return result.rows.map((row) => ({
          ...row,
          locationPoint: row.locationpoint,
          createdAt: row.created_at,
          createdBy: row.created_by,
        }));
      } catch (err) {
        console.error("Error fetching crossSections:", err);
        throw new Error("Gagal ambil data cross sections");
      }
    },

    // 🔹 Ambil semua users
    users: async () => {
      const query = `
        SELECT 
          id, username, email, role, full_name, 
          created_at, last_login_at, is_active, avatar_url
        FROM users
      `;
      try {
        const result = await client.query(query);
        return result.rows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          fullName: row.full_name,
          avatarUrl: row.avatar_url,
          lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
        }));
      } catch (err) {
        console.error("Error fetching users:", err);
        throw new Error("Gagal ambil data pengguna");
      }
    },

    // 🔹 Ambil semua layer groups
    layerGroups: async () => {
      const query = `
        SELECT id, name, description, display_order, is_active
        FROM layer_groups
        ORDER BY display_order, name
      `;
      try {
        const result = await client.query(query);
        return result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          displayOrder: row.display_order,
          isActive: row.is_active,
        }));
      } catch (err) {
        console.error("Error fetching layerGroups:", err);
        throw new Error("Gagal ambil daftar grup layer");
      }
    },

    // 🔹 Ambil semua definisi layer
    layerDefinitions: async () => {
      const query = `
        SELECT 
          ld.id, ld.name, ld.description, ld.layer_type, ld.source, ld.metadata, ld.group_id,
          lg.name AS group_name
        FROM layer_definitions ld
        LEFT JOIN layer_groups lg ON ld.group_id = lg.id
        ORDER BY lg.display_order, ld.name
      `;
      try {
        const result = await client.query(query);
        return result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          layerType: row.layer_type || "unknown",
          source: row.source,
          meta: row.metadata,
          groupId: row.group_id,
          groupName: row.group_name,
        }));
      } catch (err) {
        console.error("Error fetching layerDefinitions:", err);
        throw new Error("Gagal ambil definisi layer");
      }
    },
  },

  Mutation: {
    // 🔹 Buat spatial feature baru
    createSpatialFeature: async (_, { layerType, name, description, geometry, source, meta }) => {
      const query = `
        INSERT INTO spatial_features (
          layer_type, name, description, geom, source, metadata
        ) VALUES (
          $1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6
        )
        RETURNING 
          id, layer_type, name, description, 
          ST_AsGeoJSON(geom)::json AS geometry,
          created_at, updated_at, created_by, source, metadata
      `;
      try {
        const result = await client.query(query, [layerType, name, description, JSON.stringify(geometry), source, meta || {}]);
        const row = result.rows[0];
        return {
          ...row,
          geometry: row.geometry,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          createdBy: row.created_by,
          meta: row.metadata,
        };
      } catch (err) {
        console.error("Error creating spatialFeature:", err);
        throw new Error("Gagal buat spatial feature");
      }
    },

    // 🔹 Update spatial feature
    updateSpatialFeature: async (_, { id, name, description, geometry, source, meta }) => {
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (name) {
        fields.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (description) {
        fields.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (geometry) {
        fields.push(`geom = ST_SetSRID(ST_GeomFromGeoJSON($${paramCount++}), 4326)`);
        values.push(JSON.stringify(geometry));
      }
      if (source) {
        fields.push(`source = $${paramCount++}`);
        values.push(source);
      }
      if (meta) {
        fields.push(`metadata = $${paramCount++}`);
        values.push(meta);
      }

      if (fields.length === 0) {
        throw new Error("Tidak ada data untuk diupdate");
      }

      values.push(id);
      const query = `
        UPDATE spatial_features 
        SET ${fields.join(", ")}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING 
          id, layer_type, name, description, 
          ST_AsGeoJSON(geom)::json AS geometry,
          created_at, updated_at, created_by, source, metadata
      `;

      try {
        const result = await client.query(query, values);
        if (result.rows.length === 0) {
          throw new Error("Spatial feature tidak ditemukan");
        }
        const row = result.rows[0];
        return {
          ...row,
          geometry: row.geometry,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          createdBy: row.created_by,
          meta: row.metadata,
        };
      } catch (err) {
        console.error("Error updating spatialFeature:", err);
        throw new Error("Gagal update spatial feature");
      }
    },

    // 🔹 Hapus spatial feature
    deleteSpatialFeature: async (_, { id }) => {
      const query = "DELETE FROM spatial_features WHERE id = $1";
      try {
        const result = await client.query(query, [id]);
        if (result.rowCount === 0) {
          throw new Error("Spatial feature tidak ditemukan");
        }
        return true;
      } catch (err) {
        console.error("Error deleting spatialFeature:", err);
        throw new Error("Gagal hapus spatial feature");
      }
    },

    // 🔹 Login
    login: async (_, { email, password }) => {
      try {
        const result = await client.query("SELECT id, username, role, password_hash, last_login_at FROM users WHERE email = $1 AND is_active = true", [email]);
        if (result.rows.length === 0) {
          return {
            success: false,
            token: null,
            user: null,
            message: "Email tidak ditemukan",
          };
        }
        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
          return {
            success: false,
            token: null,
            user: null,
            message: "Password salah",
          };
        }
        // Update last_login_at
        await client.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
        return {
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
          },
          message: "Login berhasil",
        };
      } catch (err) {
        console.error("🚨 Error:", err);
        return {
          success: false,
          token: null,
          user: null,
          message: "Server error",
        };
      }
    },

    // 🔹 Register
    register: async (_, { name, email, password, role = "user", avatarUrl }) => {
      if (!name || !email || !password) {
        return {
          success: false,
          token: null,
          user: null,
          message: "Semua field wajib diisi",
        };
      }
      if (password.length < 6) {
        return {
          success: false,
          token: null,
          user: null,
          message: "Password minimal 6 karakter",
        };
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return {
          success: false,
          token: null,
          user: null,
          message: "Format email tidak valid",
        };
      }
      const validRole = ["user", "admin"].includes(role) ? role : "user";

      try {
        const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.rows.length > 0) {
          return {
            success: false,
            token: null,
            user: null,
            message: "Email sudah terdaftar",
          };
        }
        const password_hash = await bcrypt.hash(password, 10);
        const result = await client.query(
          `INSERT INTO users (username, email, password_hash, role, full_name, is_active, avatar_url)
           VALUES ($1, $2, $3, $4, $5, true, $6)
           RETURNING id, username, email, role, full_name, avatar_url`,
          [email.split("@")[0], email, password_hash, validRole, name, avatarUrl || "/images/user-default.png"]
        );
        const newUser = result.rows[0];
        const token = jwt.sign({ userId: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: "24h" });
        return {
          success: true,
          token,
          user: {
            id: newUser.id,
            username: newUser.username,
            fullName: newUser.full_name,
            email: newUser.email,
            role: newUser.role,
            avatarUrl: newUser.avatar_url,
          },
          message: "Pendaftaran berhasil",
        };
      } catch (err) {
        console.error("🚨 Register error:", err);
        return {
          success: false,
          token: null,
          user: null,
          message: "Server error",
        };
      }
    },

    // 🔹 Ubah role user
    updateUserRole: async (_, { id, role }) => {
      if (!["user", "admin"].includes(role)) {
        return {
          success: false,
          message: "Role tidak valid",
        };
      }
      try {
        const check = await client.query("SELECT id FROM users WHERE id = $1", [id]);
        if (check.rows.length === 0) {
          return {
            success: false,
            message: "User tidak ditemukan",
          };
        }
        await client.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]);
        return {
          success: true,
          message: `Role berhasil diubah menjadi ${role}`,
        };
      } catch (err) {
        console.error("Error update role:", err);
        return {
          success: false,
          message: "Gagal update role",
        };
      }
    },

    // 🔹 Hapus user
    deleteUser: async (_, { id }) => {
      try {
        const check = await client.query("SELECT id FROM users WHERE id = $1", [id]);
        if (check.rows.length === 0) {
          return false;
        }
        const result = await client.query("DELETE FROM users WHERE id = $1", [id]);
        return result.rowCount > 0;
      } catch (err) {
        console.error("Error deleting user:", err);
        return false;
      }
    },
  },

  // Resolver untuk nested field
  SpatialFeature: {
    createdBy: async (parent, _, { client }) => {
      if (!parent.createdBy) return null;
      const result = await client.query("SELECT id, username, full_name, role FROM users WHERE id = $1", [parent.createdBy]);
      const user = result.rows[0];
      return user
        ? {
            ...user,
            fullName: user.full_name,
          }
        : null;
    },
  },
  CrossSection: {
    createdBy: async (parent, _, { client }) => {
      if (!parent.createdBy) return null;
      const result = await client.query("SELECT id, username, full_name, role FROM users WHERE id = $1", [parent.createdBy]);
      const user = result.rows[0];
      return user
        ? {
            ...user,
            fullName: user.full_name,
          }
        : null;
    },
  },
};

export default resolvers;
