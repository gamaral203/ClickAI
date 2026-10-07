// Aplica as migrações no banco (Supabase ou outro Postgres) e, se ele estiver vazio, grava os
// dados de exemplo. Roda antes do `next build` (inclusive na Vercel). Sem URL de banco, não faz
// nada: o app usa o PGlite em memória, que se migra sozinho.

import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { criarCliente, urlParaMigracoes } from "../src/db/conexao";
import * as schema from "../src/db/schema";
import { semear, sincronizarGestores } from "../src/db/semente";

async function main() {
  const url = urlParaMigracoes();
  if (!url) {
    console.log(
      "Sem DATABASE_URL nem POSTGRES_URL: nada a migrar (o app usa o PGlite em memória).",
    );
    return;
  }
  const cliente = criarCliente(url, { maximo: 1 });
  const banco = drizzle({ client: cliente, schema, casing: "snake_case" });
  await migrate(banco, { migrationsFolder: path.join(process.cwd(), "src", "db", "migracoes") });
  console.log("Migrações aplicadas.");
  // Na produção, sem a conta de exemplo da equipe: a senha dela é pública (README).
  await semear(banco, { incluirEquipeDeExemplo: process.env.VERCEL_ENV !== "production" });
  await sincronizarGestores(banco);
  console.log("Dados de exemplo e gestores conferidos.");
  await cliente.end();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
