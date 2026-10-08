import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SENHA_DE_EXEMPLO } from "@/dados/exemplo/usuarios";
import { senhaConfere } from "@/lib/senha";

import { obterBanco, type Banco } from "./index";
import * as schema from "./schema";
import { semear } from "./semente";

/** Banco novo e vazio, migrado, com a semente rodada no ambiente atual. */
async function bancoSemeado() {
  const pg = new PGlite();
  const banco = drizzle({ client: pg, schema, casing: "snake_case" });
  await migrate(banco, { migrationsFolder: path.join(process.cwd(), "src", "db", "migracoes") });
  await semear(banco as unknown as Banco);
  return { pg, banco };
}

async function contar(pg: PGlite, tabela: string) {
  const { rows } = await pg.query<{ total: number }>(
    `select count(*)::int as total from ${tabela}`,
  );
  return rows[0].total;
}

async function usuarios(pg: PGlite) {
  const { rows } = await pg.query<{ email: string; papel: string; senha_hash: string | null }>(
    "select email, papel, senha_hash from usuarios",
  );
  return rows;
}

const TABELAS_DE_EXEMPLO = [
  "usuarios",
  "fotografos",
  "eventos",
  "pastas",
  "colaboradores",
  "fotos",
  "numeros",
  "rostos",
  "faixas_desconto",
  "pacotes",
  "cupons",
  "lojas",
  "pedidos",
];

describe("banco na produção", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem URL de banco, não cai no PGlite: obterBanco lança o erro", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_URL", "");
    await expect(obterBanco()).rejects.toThrow("DATABASE_URL não configurada em produção");
  });
});

describe("semente", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("na produção, grava só as categorias, sem usuários nem dados de exemplo", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SEMEAR_EXEMPLOS", "");
    const { pg } = await bancoSemeado();
    expect(await contar(pg, "categorias")).toBeGreaterThan(0);
    for (const tabela of TABELAS_DE_EXEMPLO) expect(await contar(pg, tabela), tabela).toBe(0);
    await pg.close();
  });

  it("na produção com SEMEAR_EXEMPLOS=1, ninguém entra com a senha de exemplo", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SEMEAR_EXEMPLOS", "1");
    const { pg } = await bancoSemeado();
    expect(await contar(pg, "eventos")).toBeGreaterThan(0);
    const lista = await usuarios(pg);
    expect(lista.length).toBeGreaterThan(0);
    // Sem senha (login por senha impossível) e com e-mail em domínio reservado (sem Google).
    expect(lista.filter((u) => u.senha_hash !== null)).toEqual([]);
    expect(lista.filter((u) => !u.email.endsWith("@exemplo.invalid"))).toEqual([]);
    expect(lista.filter((u) => u.papel !== "fotografo")).toEqual([]);
    await pg.close();
  });

  it("fora da produção, mantém os dados e as contas de exemplo, inclusive o gestor", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { pg, banco } = await bancoSemeado();
    for (const tabela of ["fotografos", "eventos", "fotos", "cupons", "lojas"]) {
      expect(await contar(pg, tabela), tabela).toBeGreaterThan(0);
    }
    const lista = await usuarios(pg);
    expect(lista.map((u) => u.email).sort()).toEqual([
      "admin@exemplo.com",
      "ana@exemplo.com",
      "clique@exemplo.com",
      "lia@exemplo.com",
      "pedro@exemplo.com",
    ]);
    for (const u of lista) expect(senhaConfere(SENHA_DE_EXEMPLO, u.senha_hash!)).toBe(true);
    // Rodar de novo num banco já semeado não faz nada.
    await semear(banco as unknown as Banco);
    expect(await contar(pg, "usuarios")).toBe(5);
    await pg.close();
  });
});
