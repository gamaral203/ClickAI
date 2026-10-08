CREATE TYPE "public"."motivo_estorno" AS ENUM('reembolso', 'chargeback');--> statement-breakpoint
ALTER TYPE "public"."status_pedido" ADD VALUE 'contestado';--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "estorno_de" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "reembolso_solicitado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "reembolso_solicitado_por" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "contestado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "estornado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "motivo_estorno" "motivo_estorno";--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_estorno_de_lancamentos_id_fk" FOREIGN KEY ("estorno_de") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_reembolso_solicitado_por_usuarios_id_fk" FOREIGN KEY ("reembolso_solicitado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_estorno_de_index" ON "lancamentos" USING btree ("estorno_de");