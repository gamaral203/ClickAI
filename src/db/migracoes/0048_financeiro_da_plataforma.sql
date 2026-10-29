CREATE TYPE "public"."origem_taxa_gateway" AS ENUM('mp', 'estimada');--> statement-breakpoint
CREATE TYPE "public"."status_cobranca" AS ENUM('paga', 'pendente', 'prevista', 'provisionada');--> statement-breakpoint
ALTER TYPE "public"."categoria_assinatura" ADD VALUE 'marketing';--> statement-breakpoint
ALTER TYPE "public"."ciclo_assinatura" ADD VALUE 'avulsa';--> statement-breakpoint
CREATE TABLE "cobrancas_despesa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" integer NOT NULL,
	"moeda" "moeda_assinatura" DEFAULT 'BRL' NOT NULL,
	"cotacao_dez_milesimos" integer,
	"valor_brl_centavos" integer NOT NULL,
	"iof_centavos" integer DEFAULT 0 NOT NULL,
	"status" "status_cobranca" NOT NULL,
	"pago_pelo_saldo_mp" boolean DEFAULT false NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"chave_importacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "cobrancas_despesa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "chave_importacao" text;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "taxa_gateway_centavos" integer;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "liquido_recebido_centavos" integer;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "taxa_gateway_origem" "origem_taxa_gateway";--> statement-breakpoint
ALTER TABLE "cobrancas_despesa" ADD CONSTRAINT "cobrancas_despesa_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas_despesa" ADD CONSTRAINT "cobrancas_despesa_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobrancas_despesa_assinatura_id_data_index" ON "cobrancas_despesa" USING btree ("assinatura_id","data");--> statement-breakpoint
CREATE INDEX "cobrancas_despesa_data_index" ON "cobrancas_despesa" USING btree ("data");--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_despesa_chave_importacao_index" ON "cobrancas_despesa" USING btree ("chave_importacao");--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_chave_importacao_index" ON "assinaturas" USING btree ("chave_importacao");--> statement-breakpoint
CREATE INDEX "pedidos_status_pago_em_index" ON "pedidos" USING btree ("status","pago_em");