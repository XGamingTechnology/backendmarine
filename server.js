// server.js
import express from "express";
import { ApolloServer } from "apollo-server-express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import jwt from "jsonwebtoken";
import client from "./src/config/database.js";
import toponimiIconsRoute from "./src/routes/toponimi-icons.js";

// ✅ Import middleware autentikasi
import { authenticate } from "./src/middleware/auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import typeDefs from "./src/graphql/schemas/index.js";
import resolvers from "./src/graphql/resolvers/index.js";

// ✅ Import routes
import authRoute from "./src/routes/auth.js";
import uploadRoute from "./src/routes/upload.js";
import statusRoute from "./src/routes/status.js";
import transectRoutes from "./src/routes/transect.js";

const app = express();
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);

// --- Middleware: Verify JWT (untuk GraphQL) ---
// Gunakan hasil dari middleware `authenticate` jika memungkinkan
// Tapi tetap verifikasi di GraphQL untuk keamanan tambahan
const getUserFromToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "rahasia");
    return { id: decoded.userId, role: decoded.role };
  } catch (err) {
    console.error("❌ JWT Invalid:", err.message);
    return null;
  }
};

app.use(
  cors({
    origin: "*", // 🚨 Hanya untuk development!
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use("/images", express.static(path.join(__dirname, "public", "images")));

// ✅ Gunakan middleware authenticate untuk semua route API (kecuali auth)
app.use("/api/auth", authRoute); // ❌ Jangan proteksi
app.use("/api/upload", authenticate, uploadRoute);
app.use("/api/status", authenticate, statusRoute);
app.use("/api", authenticate, transectRoutes);
app.use("/api", authenticate, toponimiIconsRoute);

// ✅ Route info
app.get("/api", (req, res) => {
  res.json({ message: "WebGIS Backend API", version: "1.0" });
});

// --- GraphQL Server ---
async function startApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      // Ambil token dari header
      const authHeader = req.headers?.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

      // Verifikasi token
      const user = getUserFromToken(token);

      return {
        req,
        client,
        user, // Tersedia di resolver
      };
    },
    introspection: true,
    playground: process.env.NODE_ENV !== "production", // Aktif di dev
  });

  await server.start();

  // Terapkan middleware GraphQL
  server.applyMiddleware({ app, path: "/graphql" });

  // Jalankan server
  httpServer.listen(PORT, () => {
    console.log(`✅ Connected to PostgreSQL`);
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🚀 GraphQL endpoint: http://localhost:${PORT}/graphql`);
    console.log(`💡 Playground: http://localhost:${PORT}/graphql`);
    console.log("🔐 JWT_SECRET:", process.env.JWT_SECRET ? "Loaded" : "Missing!");
    console.log("📦 PORT:", process.env.PORT);
    console.log("🏠 Host:", process.env.DB_HOST || "localhost");
    console.log("🗄️  Database:", process.env.DB_NAME);
  });
}

startApolloServer().catch((err) => {
  console.error("❌ Error starting server:", err);
});
