import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { obterBanco } from "@/db";

import { PAPEL_DO_APP, SQL_ACESSO_DO_APP } from "./papel-app";

function linhasDe<T>(resultado: unknown): T[] {
  return (Array.isArray(resultado) ? resultado : (resultado as { rows: unknown[] }).rows) as T[];
}

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
    // Os dois drivers devolvem um objeto com `rows`; a lista fica por garantia.
    const tabelas = (Array.isArray(linhas) ? linhas : (linhas as { rows: unknown[] }).rows) as {
      tabela: string;
      rls: boolean;
    }[];
    expect(tabelas.length).toBeGreaterThan(20);
    expect(tabelas.filter((t) => !t.rls).map((t) => t.tabela)).toEqual([]);
  });

  it("o papel do app só lê e escreve dados, com a política do RLS em todas as tabelas", async () => {
    const banco = await obterBanco();
    // Sem o papel, o bloco não faz nada.
    await banco.execute(SQL_ACESSO_DO_APP);
    await banco.execute(sql.raw(`CREATE ROLE ${PAPEL_DO_APP} NOLOGIN`));
    // Duas vezes: roda a cada deploy e não pode falhar com a política já criada.
    await banco.execute(SQL_ACESSO_DO_APP);
    await banco.execute(SQL_ACESSO_DO_APP);

    const semPolitica = linhasDe<{ tabela: string }>(
      await banco.execute(sql`
        select t.tablename as tabela from pg_tables t
        where t.schemaname = 'public' and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = t.tablename
            and p.policyname = 'acesso_do_app'
        )
      `),
    );
    expect(semPolitica).toEqual([]);

    const [privilegios] = linhasDe<{ dml: boolean; truncar: boolean; criar: boolean }>(
      await banco.execute(
        sql.raw(`select
          has_table_privilege('${PAPEL_DO_APP}', 'public.pedidos', 'SELECT,INSERT,UPDATE,DELETE') as dml,
          has_table_privilege('${PAPEL_DO_APP}', 'public.pedidos', 'TRUNCATE') as truncar,
          has_schema_privilege('${PAPEL_DO_APP}', 'public', 'CREATE') as criar`),
      ),
    );
    expect(privilegios).toEqual({ dml: true, truncar: false, criar: false });

    // Com o papel do app, o RLS deixa ler (a política libera só para ele).
    await banco.execute(sql.raw(`SET ROLE ${PAPEL_DO_APP}`));
    try {
      const [{ total }] = linhasDe<{ total: number }>(
        await banco.execute(sql`select count(*)::int as total from categorias`),
      );
      expect(total).toBeGreaterThan(0);
    } finally {
      await banco.execute(sql`RESET ROLE`);
    }
  });
});
