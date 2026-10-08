ALTER TYPE "public"."tipo_mensagem" ADD VALUE 'lembrete_pix';--> statement-breakpoint
ALTER TYPE "public"."tipo_mensagem" ADD VALUE 'venda';--> statement-breakpoint
CREATE TABLE "tentativas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tentativas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "lembrete_pix_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rostos" ADD COLUMN "caixa" jsonb;--> statement-breakpoint
CREATE INDEX "tentativas_chave_em_index" ON "tentativas" USING btree ("chave","em");