-- Leitura do número de peito (src/servicos/numeros.ts). A opção do evento nasce ligada nas
-- categorias com peito (src/lib/numeros-de-peito.ts, CATEGORIAS_COM_NUMERO) e desligada nas
-- demais; cada número fica uma vez por foto (a releitura substitui os lidos).
DROP INDEX "numeros_foto_id_index";--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "ler_numeros" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "numeros_lidos_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "numeros" ADD COLUMN "confianca" double precision;--> statement-breakpoint
ALTER TABLE "numeros" ADD COLUMN "caixa" jsonb;--> statement-breakpoint
ALTER TABLE "numeros" ADD COLUMN "manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DELETE FROM "numeros" a USING "numeros" b
WHERE a."foto_id" = b."foto_id" AND a."numero" = b."numero" AND a."id" > b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "numeros_foto_id_numero_index" ON "numeros" USING btree ("foto_id","numero");--> statement-breakpoint
UPDATE "eventos" SET "ler_numeros" = true
WHERE "categoria_id" IN (
  SELECT "id" FROM "categorias"
  WHERE "slug" IN ('corrida', 'ciclismo', 'esportes', 'esportes-aquaticos')
);
