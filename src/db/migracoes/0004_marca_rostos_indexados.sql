ALTER TABLE "fotos" ADD COLUMN "rostos_indexados_em" timestamp with time zone;--> statement-breakpoint
-- Fotos que já têm rosto gravado já passaram pelo reconhecimento: não precisam voltar a ele.
UPDATE "fotos" SET "rostos_indexados_em" = now() WHERE EXISTS (SELECT 1 FROM "rostos" WHERE "rostos"."foto_id" = "fotos"."id");