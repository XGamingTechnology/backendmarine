// server.js
import express from "express";
import { ApolloServer } from "apollo-server-express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import routes
import authRoute from "./src/routes/auth.js";
import uploadRoute from "./src/routes/upload.js";
import statusRoute from "./src/routes/status.js";
import transectRoutes from "./src/routes/transect.js";
import toponimiIconsRoute from "./src/routes/toponimi-icons.js";
import { authenticate } from "./src/middleware/auth.js";

// Import GraphQL
import typeDefs from "./src/graphql/schemas/index.js";
import resolvers from "./src/graphql/resolvers/index.js";
import client from "./src/config/database.js";

const app = express();
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);

// --- Middleware ---
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use("/images", express.static(path.join(__dirname, "public", "images")));

// --- Routes ---
app.use("/api/auth", authRoute);
app.use("/api/upload", authenticate, uploadRoute);
app.use("/api/status", authenticate, statusRoute);
app.use("/api", authenticate, transectRoutes);
app.use("/api", authenticate, toponimiIconsRoute);

app.get("/api", (req, res) => {
  res.json({ message: "WebGIS Backend API", version: "1.0" });
});

// --- GraphQL Server ---
async function startApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => ({
      req,
      db: client,
      user: req.user || null, // ✅ req.user dari middleware
    }),
    introspection: true,
    playground: process.env.NODE_ENV !== "production",
  });

  await server.start();

  // ✅ 1. Middleware authenticate untuk /graphql
  app.use("/graphql", authenticate);

  // ✅ 2. Baru apply GraphQL middleware
  server.applyMiddleware({ app, path: "/graphql" });

  httpServer.listen(PORT, () => {
    console.log(`✅ Connected to PostgreSQL`);
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🚀 GraphQL endpoint: http://localhost:${PORT}/graphql`);
    console.log(`🔐 JWT Secret loaded: ${!!process.env.JWT_SECRET}`);
  });
}

startApolloServer().catch((err) => {
  console.error("❌ Error starting server:", err);
});
