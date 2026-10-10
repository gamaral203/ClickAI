-- Liberação por foto: cada foto guarda o modo do lote e o horário em que passa a aparecer
-- (fotos.liberar_em). As fotos que já existem herdam a liberação do evento.
ALTER TYPE "public"."tipo_mensagem" ADD VALUE 'liberacao';--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "liberacao" "liberacao" DEFAULT 'automatica' NOT NULL;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "liberar_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "aviso_liberacao_em" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "fotos_evento_id_liberar_em_index" ON "fotos" USING btree ("evento_id","liberar_em");--> statement-breakpoint
-- Automática: a foto já aparecia desde o envio.
UPDATE "fotos" SET "liberacao" = 'automatica', "liberar_em" = "fotos"."criado_em" FROM "eventos" WHERE "eventos"."id" = "fotos"."evento_id" AND "eventos"."liberacao" = 'automatica';--> statement-breakpoint
-- Manual ou agendada: vale o eventos.liberado_em de antes (nulo = ainda aguardando o "Liberar agora").
UPDATE "fotos" SET "liberacao" = "eventos"."liberacao", "liberar_em" = "eventos"."liberado_em" FROM "eventos" WHERE "eventos"."id" = "fotos"."evento_id" AND "eventos"."liberacao" <> 'automatica';--> statement-breakpoint
-- Liberações que já aconteceram não geram aviso agora.
UPDATE "fotos" SET "aviso_liberacao_em" = "liberar_em" WHERE "liberar_em" IS NOT NULL AND "liberar_em" <= now();
