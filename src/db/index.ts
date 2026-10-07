import "server-only";

import path from "node:path";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { connection } from "next/server";

import { criarCliente, emProducao, ERRO_SEM_BANCO_EM_PRODUCAO, urlDoBanco } from "./conexao";
import * as schema from "./schema";
import { sincronizarGestores } from "./semente";

// Conexão com o banco (docs/arquitetura.md). Com DATABASE_URL ou POSTGRES_URL (Supabase, pela
// Vercel), usa o postgres.js pela URL do pooler (ver ./conexao.ts). Sem elas (desenvolvimento
// local, preview e testes), usa o PGlite: um Postgres que roda dentro do próprio Node, em memória,
// com as mesmas migrações e os dados de exemplo. Assim o projeto roda sem configurar nada. Na
// produção da Vercel, sem URL, não sobe (ERRO_SEM_BANCO_EM_PRODUCAO).

export type Banco = PostgresJsDatabase<typeof schema>;

const global = globalThis as typeof globalThis & { __clicouaiBanco?: Promise<Banco> };

export const PASTA_MIGRACOES = path.join(process.cwd(), "src", "db", "migracoes");

async function conectarPostgres(url: string): Promise<Banco> {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  return drizzle({ client: criarCliente(url), schema, casing: "snake_case" });
}

async function conectarPglite(): Promise<Banco> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { semear } = await import("./semente");
  const banco = drizzle({ client: new PGlite(), schema, casing: "snake_case" });
  await migrate(banco, { migrationsFolder: PASTA_MIGRACOES });
  // Os dois drivers são o mesmo Postgres pelo Drizzle; o tipo do postgres.js serve para os dois.
  const comoPostgres = banco as unknown as Banco;
  await semear(comoPostgres);
  return comoPostgres;
}

/**
 * Banco do processo, criado na primeira chamada. Os gestores de GESTORES são conferidos a cada
 * início, para uma senha trocada na Vercel valer no próximo deploy.
 */
export async function obterBanco(): Promise<Banco> {
  // Dentro de uma requisição, espera por ela antes de tocar no banco: os drivers leem o relógio
  // (Date.now), e o Next não deixa ler o relógio durante a pré-renderização. Fora de uma
  // requisição (testes, scripts), connection() não se aplica.
  try {
    await connection();
  } catch {
    // Fora de uma requisição do Next.
  }
  global.__clicouaiBanco ??= (async () => {
    const url = urlDoBanco();
    if (!url && emProducao()) throw new Error(ERRO_SEM_BANCO_EM_PRODUCAO);
    const banco = url ? await conectarPostgres(url) : await conectarPglite();
    await sincronizarGestores(banco);
    return banco;
  })().catch((erro) => {
    // Falhou ao conectar: a próxima requisição tenta de novo, em vez de ficar presa no erro.
    global.__clicouaiBanco = undefined;
    throw erro;
  });
  return global.__clicouaiBanco;
}

export { schema };
