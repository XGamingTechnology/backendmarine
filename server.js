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

// --- Middleware: Verify JWT ---
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
    origin: "*",
  })
);

app.use(express.json({ limit: "50mb" }));
app.use("/images", express.static(path.join(__dirname, "public", "images")));

// ✅ Gunakan routes
app.use("/api/auth", authRoute);
app.use("/api/upload", uploadRoute);
app.use("/api/status", statusRoute);
app.use("/api", transectRoutes);

// ✅ Gunakan route
app.use("/api", toponimiIconsRoute); // atau app.use("/api/toponimi-icons", toponimiIconsRoute);

app.get("/api", (req, res) => {
  res.json({ message: "WebGIS Backend API", version: "1.0" });
});

async function startApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
      const user = getUserFromToken(token);

      return {
        req,
        client,
        user,
      };
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
    console.log(`💡 Playground: http://localhost:${PORT}/graphql`);
  });
}

startApolloServer().catch((err) => {
  console.error("❌ Error starting server:", err);
});
