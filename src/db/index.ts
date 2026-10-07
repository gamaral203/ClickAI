import "server-only";

import path from "node:path";

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { connection } from "next/server";

import * as schema from "./schema";
import { sincronizarGestores } from "./semente";

// Conexão com o banco (docs/arquitetura.md). Com DATABASE_URL (Neon, pela Vercel), usa o driver
// serverless do Neon pela URL com pooler, com transações. Sem ela (desenvolvimento local e
// testes), usa o PGlite: um Postgres que roda dentro do próprio Node, em memória, com as mesmas
// migrações e os dados de exemplo. Assim o projeto roda sem configurar nada.

export type Banco = NeonDatabase<typeof schema>;

const global = globalThis as typeof globalThis & { __clicouaiBanco?: Promise<Banco> };

export const PASTA_MIGRACOES = path.join(process.cwd(), "src", "db", "migracoes");

async function conectarNeon(url: string): Promise<Banco> {
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  return drizzle({ client: new Pool({ connectionString: url }), schema, casing: "snake_case" });
}

async function conectarPglite(): Promise<Banco> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { semear } = await import("./semente");
  const banco = drizzle({ client: new PGlite(), schema, casing: "snake_case" });
  await migrate(banco, { migrationsFolder: PASTA_MIGRACOES });
  // Os dois drivers são o mesmo Postgres pelo Drizzle; o tipo do Neon serve para os dois.
  const comoNeon = banco as unknown as Banco;
  await semear(comoNeon, { incluirEquipeDeExemplo: true });
  return comoNeon;
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
    const url = process.env.DATABASE_URL;
    const banco = url ? await conectarNeon(url) : await conectarPglite();
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
