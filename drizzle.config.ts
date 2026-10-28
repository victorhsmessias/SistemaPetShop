import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// Migrations rodam sempre como migrador, o dono das tabelas.
if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.DATABASE_URL_MIGRADOR;
if (!url) throw new Error("DATABASE_URL_MIGRADOR não definida (veja .env.example).");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/*/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
