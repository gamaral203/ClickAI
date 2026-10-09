import { sql } from "drizzle-orm";

// Menor privilégio no banco (docs/seguranca.md, item 18). Por padrão o app conecta como o dono
// das tabelas (`postgres` no Supabase), que pode tudo: criar e apagar tabelas, mexer em papéis,
// ignorar o RLS. O recomendado é o app usar um papel só com SELECT, INSERT, UPDATE e DELETE
// (`clicouai_app`, criado à mão uma vez, com o SQL de docs/seguranca.md) e deixar o dono só para
// as migrações (DATABASE_URL_DIRETA).
//
// Como toda tabela tem RLS ligado e nenhuma política, o papel do app precisa de uma política
// liberando tudo para ele (e só para ele: anon e authenticated continuam sem nada). Este bloco
// roda no fim de cada `npm run db:migrar`, com o dono: dá as permissões e cria a política nas
// tabelas novas. Sem o papel `clicouai_app` no banco, não faz nada.

export const PAPEL_DO_APP = "clicouai_app";

export const SQL_ACESSO_DO_APP = sql.raw(`
DO $$
DECLARE
  tabela text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PAPEL_DO_APP}') THEN
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public TO ${PAPEL_DO_APP};
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${PAPEL_DO_APP};
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${PAPEL_DO_APP};
  FOR tabela IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tabela AND policyname = 'acesso_do_app'
    ) THEN
      EXECUTE format(
        'CREATE POLICY acesso_do_app ON public.%I TO ${PAPEL_DO_APP} USING (true) WITH CHECK (true)',
        tabela
      );
    END IF;
  END LOOP;
END $$;
`);
