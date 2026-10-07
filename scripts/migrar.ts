// Aplica as migrações no banco do DATABASE_URL e, se ele estiver vazio, grava os dados de
// exemplo. Roda antes do `next build` (inclusive na Vercel). Sem DATABASE_URL, não faz nada:
// o app usa o PGlite em memória, que se migra sozinho.

import path from "node:path";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import * as schema from "../src/db/schema";
import { semear, sincronizarGestores } from "../src/db/semente";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("Sem DATABASE_URL: nada a migrar (o app usa o PGlite em memória).");
    return;
  }
  const pool = new Pool({ connectionString: url });
  const banco = drizzle({ client: pool, schema, casing: "snake_case" });
  await migrate(banco, { migrationsFolder: path.join(process.cwd(), "src", "db", "migracoes") });
  console.log("Migrações aplicadas.");
  // Na produção, sem as contas de exemplo da equipe: a senha delas é pública (README).
  await semear(banco, { incluirEquipeDeExemplo: process.env.VERCEL_ENV !== "production" });
  await sincronizarGestores(banco);
  console.log("Dados de exemplo e gestores conferidos.");
  await pool.end();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
