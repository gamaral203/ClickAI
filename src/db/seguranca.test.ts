import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { obterBanco } from "@/db";

// No Supabase, tabela sem RLS no schema public fica legível pela API REST com a chave pública.
// Toda tabela do app precisa de `.enableRLS()` em src/db/schema.ts.
describe("segurança do banco", () => {
  it("todas as tabelas do schema public têm RLS ligado", async () => {
    const banco = await obterBanco();
    const linhas = await banco.execute<{ tabela: string; rls: boolean }>(sql`
      select c.relname as tabela, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);
    // postgres.js devolve a lista; o PGlite, um objeto com `rows`.
    const tabelas = (Array.isArray(linhas) ? linhas : (linhas as { rows: unknown[] }).rows) as {
      tabela: string;
      rls: boolean;
    }[];
    expect(tabelas.length).toBeGreaterThan(20);
    expect(tabelas.filter((t) => !t.rls).map((t) => t.tabela)).toEqual([]);
  });
});
