// Aplica as migrações no banco (Supabase ou outro Postgres) e, se ele estiver vazio, grava os
// dados de exemplo (na produção, só o necessário: ver src/db/semente.ts). Roda antes do
// `next build` (inclusive na Vercel). Sem URL de banco, não faz nada: o app usa o PGlite em
// memória, que se migra sozinho. Na produção da Vercel, sem URL, o build falha.

import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import {
  criarCliente,
  emProducao,
  ERRO_SEM_BANCO_EM_PRODUCAO,
  urlParaMigracoes,
} from "../src/db/conexao";
import * as schema from "../src/db/schema";
import { semear, sincronizarGestores } from "../src/db/semente";

async function main() {
  const url = urlParaMigracoes();
  if (!url) {
    if (emProducao()) {
      console.error(ERRO_SEM_BANCO_EM_PRODUCAO);
      process.exit(1);
    }
    console.log(
      "Sem DATABASE_URL nem POSTGRES_URL: nada a migrar (o app usa o PGlite em memória).",
    );
    return;
  }
  const cliente = criarCliente(url, { maximo: 1 });
  const banco = drizzle({ client: cliente, schema, casing: "snake_case" });
  await migrate(banco, { migrationsFolder: path.join(process.cwd(), "src", "db", "migracoes") });
  console.log("Migrações aplicadas.");
  await semear(banco);
  await sincronizarGestores(banco);
  console.log("Semente e gestores conferidos.");
  await cliente.end();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
