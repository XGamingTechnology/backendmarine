// server.js
import express from "express";
import { ApolloServer } from "apollo-server-express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";

// Load environment variables
dotenv.config();

// Import GraphQL Type Definitions dan Resolvers (akan dibuat nanti)
// server.js
import typeDefs from "./src/graphql/schemas/index.js";
import resolvers from "./src/graphql/resolvers/index.js";

// Import DB connection jika sudah ada (opsional untuk sekarang)
// import connectDB from './src/config/database';
// Tambahkan ini di bagian atas server.js, setelah import lain
import "./src/config/database.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server
const httpServer = http.createServer(app);

// Enable CORS
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

// Function to start Apollo Server
async function startApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      // Di sini bisa tambahkan auth, user, dll nanti
      return {
        // req,
      };
    },
    introspection: true, // Enable GraphQL Playground di production? Hanya untuk dev
    playground: true,
  });

  await server.start();
  server.applyMiddleware({ app, path: "/graphql" });

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🚀 GraphQL endpoint available at http://localhost:${PORT}/graphql`);
  });
}

// Jalankan server
startApolloServer().catch((err) => {
  console.error("Error starting server:", err);
});
