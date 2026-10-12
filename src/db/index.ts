import "server-only";

import path from "node:path";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { connection } from "next/server";

import {
  comNovaTentativa,
  criarCliente,
  emProducao,
  ERRO_SEM_BANCO_EM_PRODUCAO,
  urlDoBanco,
} from "./conexao";
import * as schema from "./schema";
import { sincronizarGestores } from "./semente";

// Conexão com o banco (docs/arquitetura.md). Com DATABASE_URL ou POSTGRES_URL (Supabase, pela
// Vercel), usa o node-postgres pela URL do pooler (ver ./conexao.ts). Sem elas (desenvolvimento
// local, preview e testes), usa o PGlite: um Postgres que roda dentro do próprio Node, em memória,
// com as mesmas migrações e os dados de exemplo. Assim o projeto roda sem configurar nada. Na
// produção da Vercel, sem URL, não sobe (ERRO_SEM_BANCO_EM_PRODUCAO).

export type Banco = NodePgDatabase<typeof schema>;

const global = globalThis as typeof globalThis & { __clicouaiBanco?: Promise<Banco> };

export const PASTA_MIGRACOES = path.join(process.cwd(), "src", "db", "migracoes");

async function conectarPostgres(url: string): Promise<Banco> {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  return drizzle({ client: criarCliente(url), schema, casing: "snake_case" });
}

async function conectarPglite(): Promise<Banco> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { semear } = await import("./semente");
  const banco = drizzle({ client: new PGlite(), schema, casing: "snake_case" });
  await migrate(banco, { migrationsFolder: PASTA_MIGRACOES });
  // Os dois drivers são o mesmo Postgres pelo Drizzle; o tipo do node-postgres serve para os dois.
  const comoPostgres = banco as unknown as Banco;
  // Só aqui, no banco de exemplo, as contas de exemplo ganham a senha pública.
  await semear(comoPostgres, { contasComSenha: true });
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
    // A primeira consulta abre a conexão de verdade: com nova tentativa, porque na Vercel a
    // instância nova pode ser recusada de passagem pelo pooler, e isso derrubava a primeira
    // requisição de cada instância ("Algo deu errado"; a seguinte passava).
    if (url) await comNovaTentativa(() => banco.execute(sql`select 1`));
    // Os gestores de GESTORES: útil, mas não pode derrubar o site se falhar (fica no log).
    try {
      await sincronizarGestores(banco);
    } catch (erro) {
      console.error("[db] falha ao sincronizar os gestores de GESTORES:", erro);
    }
    return banco;
  })().catch((erro) => {
    // Falhou ao conectar: a próxima requisição tenta de novo, em vez de ficar presa no erro.
    global.__clicouaiBanco = undefined;
    throw erro;
  });
  return global.__clicouaiBanco;
}

export { schema };
