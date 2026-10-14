CREATE TYPE "public"."categoria_assinatura" AS ENUM('hospedagem', 'banco', 'armazenamento', 'email', 'ia', 'dominio', 'pagamentos', 'outros');--> statement-breakpoint
CREATE TYPE "public"."ciclo_assinatura" AS ENUM('mensal', 'anual', 'uso');--> statement-breakpoint
CREATE TYPE "public"."moeda_assinatura" AS ENUM('BRL', 'USD');--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"categoria" "categoria_assinatura" NOT NULL,
	"plano" text DEFAULT '' NOT NULL,
	"valor_centavos" integer NOT NULL,
	"moeda" "moeda_assinatura" DEFAULT 'BRL' NOT NULL,
	"ciclo" "ciclo_assinatura" NOT NULL,
	"assinada_em" date NOT NULL,
	"renova_em" date,
	"ativa" boolean DEFAULT true NOT NULL,
	"forma_pagamento" text DEFAULT '' NOT NULL,
	"responsavel" text DEFAULT '' NOT NULL,
	"link_painel" text,
	"observacoes" text DEFAULT '' NOT NULL,
	"aviso7d_em" timestamp with time zone,
	"aviso1d_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "configuracoes_gestao" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" integer NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "configuracoes_gestao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contadores_uso" (
	"dia" date NOT NULL,
	"chave" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contadores_uso_dia_chave_pk" PRIMARY KEY("dia","chave")
);
--> statement-breakpoint
ALTER TABLE "contadores_uso" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_gestao" ADD CONSTRAINT "configuracoes_gestao_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assinaturas_ativa_renova_em_index" ON "assinaturas" USING btree ("ativa","renova_em");