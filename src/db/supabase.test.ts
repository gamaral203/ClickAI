import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// Simula o Supabase: os papéis anon e authenticated com o acesso padrão que ele dá ao schema
// public (pela API REST, com a chave pública). Depois das migrações, eles não podem nada.
describe("migrações no Supabase", () => {
  it("tiram de anon e authenticated o acesso às tabelas", async () => {
    const pg = new PGlite();
    await pg.exec(`
      create role anon nologin;
      create role authenticated nologin;
      grant usage on schema public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    await migrate(drizzle({ client: pg }), {
      migrationsFolder: path.join(process.cwd(), "src", "db", "migracoes"),
    });
    const { rows } = await pg.query<{ papel: string; tabela: string }>(`
      select r.rolname as papel, c.relname as tabela
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join pg_roles r
      where n.nspname = 'public' and c.relkind = 'r' and r.rolname in ('anon', 'authenticated')
        and (has_table_privilege(r.oid, c.oid, 'SELECT') or has_table_privilege(r.oid, c.oid, 'INSERT'))
    `);
    expect(rows).toEqual([]);
    await pg.close();
  });
});
