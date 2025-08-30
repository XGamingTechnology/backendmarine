// --- server.js (versi diperbaiki) ---

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

// ✅ IMPORT authenticate DI SINI!
import { authenticate } from "./src/middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);

// --- Middleware: CORS ---
app.use(
  cors({
    origin: "*", // 🚨 Hanya untuk dev!
    credentials: true,
  })
);

// ✅ 1. Static files
app.use("/images", express.static(path.join(__dirname, "public", "images")));

// ✅ 2. Route tanpa body JSON (upload)
app.use("/api/upload", authenticate, uploadRoute); // ← multer handle sendiri

// ✅ 3. Route dengan JSON: gunakan express.json() setelah upload
app.use(express.json({ limit: "50mb" }));

// ✅ 4. Route lainnya (butuh JSON)
app.use("/api/auth", authRoute);
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
      const authHeader = req.headers?.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
      const user = getUserFromToken(token);
      return { req, client, user };
    },
    introspection: true,
    playground: process.env.NODE_ENV !== "production",
  });

  await server.start();
  server.applyMiddleware({ app, path: "/graphql" });

  httpServer.listen(PORT, () => {
    console.log(`✅ Connected to PostgreSQL`);
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🚀 GraphQL endpoint: http://localhost:${PORT}/graphql`);
  });
}

// ✅ Helper: Verify JWT
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

startApolloServer().catch((err) => {
  console.error("❌ Error starting server:", err);
});
