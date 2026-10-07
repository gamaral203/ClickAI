import { defineConfig } from "drizzle-kit";

// Migrações do banco (docs/tarefas.md, Fase 11). `npm run db:gerar` cria a migração a partir de
// src/db/schema.ts; `npm run db:migrar` aplica no banco do DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migracoes",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
