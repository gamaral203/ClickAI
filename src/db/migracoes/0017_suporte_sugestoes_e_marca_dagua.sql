CREATE TYPE "public"."autor_mensagem_suporte" AS ENUM('usuario', 'equipe');--> statement-breakpoint
CREATE TYPE "public"."status_sugestao" AS ENUM('nova', 'em_analise', 'feita', 'descartada');--> statement-breakpoint
CREATE TABLE "conversas_suporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"nao_lida_pela_equipe" boolean DEFAULT false NOT NULL,
	"nao_lida_pelo_usuario" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversas_suporte" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mensagens_suporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"autor" "autor_mensagem_suporte" NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mensagens_suporte" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sugestoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"texto" text NOT NULL,
	"status" "status_sugestao" DEFAULT 'nova' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sugestoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fotografos" ADD COLUMN "modelo_marca" text DEFAULT 'padrao' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversas_suporte" ADD CONSTRAINT "conversas_suporte_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_suporte" ADD CONSTRAINT "mensagens_suporte_conversa_id_conversas_suporte_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas_suporte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugestoes" ADD CONSTRAINT "sugestoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_suporte_usuario_id_index" ON "conversas_suporte" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "conversas_suporte_atualizado_em_index" ON "conversas_suporte" USING btree ("atualizado_em");--> statement-breakpoint
CREATE INDEX "mensagens_suporte_conversa_id_criado_em_index" ON "mensagens_suporte" USING btree ("conversa_id","criado_em");--> statement-breakpoint
CREATE INDEX "sugestoes_criado_em_index" ON "sugestoes" USING btree ("criado_em");