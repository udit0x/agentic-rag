// Load environment variables first
import dotenv from "dotenv";
dotenv.config();

import { defineConfig } from "drizzle-kit";

const DB_TYPE = process.env.DB_TYPE || "sqlite";

let config;

if (DB_TYPE === "sqlite") {
  const dbPath = process.env.DB_PATH || "./data/local.sqlite";
  
  config = defineConfig({
    out: "./migrations/sqlite",
    schema: "./shared/schemas/sqlite.ts",
    dialect: "sqlite",
    dbCredentials: {
      url: dbPath,
    },
  });
} else if (DB_TYPE === "postgresql") {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL");
  }

  config = defineConfig({
    out: "./migrations/postgresql",
    schema: "./shared/schemas/postgresql.ts", 
    dialect: "postgresql",
    dbCredentials: {
      url: process.env.DATABASE_URL,
    },
  });
} else {
  throw new Error(`Unsupported database type: ${DB_TYPE}. Use 'sqlite' or 'postgresql'`);
}

export default config;
