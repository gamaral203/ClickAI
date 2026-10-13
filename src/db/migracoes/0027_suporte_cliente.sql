CREATE TYPE "public"."tipo_contato_suporte" AS ENUM('fotografo', 'gestor', 'cliente', 'visitante');--> statement-breakpoint
ALTER TABLE "conversas_suporte" ALTER COLUMN "usuario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversas_suporte" ADD COLUMN "visitante_id" text;--> statement-breakpoint
ALTER TABLE "conversas_suporte" ADD COLUMN "tipo" "tipo_contato_suporte" DEFAULT 'fotografo' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_suporte_visitante_id_index" ON "conversas_suporte" USING btree ("visitante_id");--> statement-breakpoint
UPDATE "conversas_suporte" SET "tipo" = 'gestor' FROM "usuarios" WHERE "usuarios"."id" = "conversas_suporte"."usuario_id" AND "usuarios"."papel" = 'admin';
