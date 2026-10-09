ALTER TABLE "colaboradores" ADD COLUMN "aceito_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "desconto_progressivo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Quem já colaborava antes do convite com aceite continua podendo enviar fotos.
UPDATE "colaboradores" SET "aceito_em" = now() WHERE "aceito_em" IS NULL;
