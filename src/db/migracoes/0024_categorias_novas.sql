-- Categorias novas e nomes atualizados. Só mexe num banco que já tem categorias (produção);
-- num banco vazio, a semente (src/db/semente.ts) cria a lista completa. Os slugs não mudam:
-- eles estão nos filtros e nos links.
UPDATE "categorias" SET "nome" = 'Corridas' WHERE "slug" = 'corrida';--> statement-breakpoint
UPDATE "categorias" SET "nome" = 'Formaturas' WHERE "slug" = 'formatura';--> statement-breakpoint
UPDATE "categorias" SET "nome" = 'Shows e Festas' WHERE "slug" = 'festas';--> statement-breakpoint
INSERT INTO "categorias" ("nome", "slug")
SELECT v.nome, v.slug
FROM (VALUES
  ('Corridas', 'corrida'),
  ('Ciclismo', 'ciclismo'),
  ('Esportes', 'esportes'),
  ('Cavalgadas e Vaquejadas', 'cavalgadas-e-vaquejadas'),
  ('Shows e Festas', 'festas'),
  ('Formaturas', 'formatura'),
  ('Casamentos', 'casamentos'),
  ('Aniversários', 'aniversarios'),
  ('Eventos Escolares', 'eventos-escolares'),
  ('Eventos Religiosos', 'eventos-religiosos'),
  ('Eventos Corporativos', 'eventos-corporativos'),
  ('Automobilismo', 'automobilismo'),
  ('Feiras e Exposições', 'feiras-e-exposicoes'),
  ('Ensaios Fotográficos', 'ensaios-fotograficos'),
  ('Eventos Sociais', 'eventos-sociais'),
  ('Outros', 'outros')
) AS v(nome, slug)
WHERE EXISTS (SELECT 1 FROM "categorias")
ON CONFLICT ("slug") DO NOTHING;
