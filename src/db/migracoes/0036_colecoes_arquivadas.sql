ALTER TABLE "eventos" ADD COLUMN "ultima_busca_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "rostos_arquivados_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "reindexacao_pedida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "reindexacao_ate" timestamp with time zone;--> statement-breakpoint
-- Antes desta migração as buscas não eram registradas. A última visita à página do evento (toda busca
-- por selfie acontece nela) fica no lugar, para nenhum evento procurado há pouco ser arquivado.
UPDATE "eventos" SET "ultima_busca_em" = (SELECT max("metricas"."em") FROM "metricas" WHERE "metricas"."evento_id" = "eventos"."id" AND "metricas"."tipo" = 'visita_evento');
