CREATE TYPE "public"."armazenamento_originais" AS ENUM('r2', 'hibrido');--> statement-breakpoint
CREATE TYPE "public"."operacao_armazenamento" AS ENUM('upload_original', 'download_original', 'leitura_original');--> statement-breakpoint
CREATE TYPE "public"."provedor_original" AS ENUM('r2', 'drive');--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid
);
--> statement-breakpoint
ALTER TABLE "configuracoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credenciais_google_drive" (
	"chave" text PRIMARY KEY DEFAULT 'principal' NOT NULL,
	"conta_email" text,
	"refresh_token_cifrado" text NOT NULL,
	"escopo" text,
	"pasta_raiz_id" text,
	"conectado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"conectado_por" uuid,
	"ultimo_erro" text,
	"ultimo_erro_em" timestamp with time zone,
	"ultimo_uso_em" timestamp with time zone,
	CONSTRAINT "credenciais_google_drive_linha_unica" CHECK ("credenciais_google_drive"."chave" = 'principal')
);
--> statement-breakpoint
ALTER TABLE "credenciais_google_drive" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metricas_armazenamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" "provedor_original" NOT NULL,
	"operacao" "operacao_armazenamento" NOT NULL,
	"duracao_ms" integer NOT NULL,
	"bytes" bigint,
	"sucesso" boolean NOT NULL,
	"erro" text,
	"foto_id" uuid,
	"evento_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metricas_armazenamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pastas_drive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"evento_id" uuid,
	"drive_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pastas_drive_fotografo_evento" UNIQUE NULLS NOT DISTINCT("fotografo_id","evento_id")
);
--> statement-breakpoint
ALTER TABLE "pastas_drive" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "armazenamento_originais" "armazenamento_originais" DEFAULT 'r2' NOT NULL;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "provedor_original" "provedor_original" DEFAULT 'r2' NOT NULL;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "drive_arquivo_id" text;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credenciais_google_drive" ADD CONSTRAINT "credenciais_google_drive_conectado_por_usuarios_id_fk" FOREIGN KEY ("conectado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastas_drive" ADD CONSTRAINT "pastas_drive_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastas_drive" ADD CONSTRAINT "pastas_drive_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metricas_armazenamento_provedor_operacao_criado_em_index" ON "metricas_armazenamento" USING btree ("provedor","operacao","criado_em");