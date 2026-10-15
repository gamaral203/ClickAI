CREATE TABLE "configuracoes_marca" (
	"revisao" integer PRIMARY KEY NOT NULL,
	"tamanho_pct" integer NOT NULL,
	"quantidade" integer NOT NULL,
	"opacidade_pct" integer NOT NULL,
	"largura_previa" integer NOT NULL,
	"qualidade" integer NOT NULL,
	"variacao" boolean NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criada_por" uuid,
	"regeracao_pedida_em" timestamp with time zone,
	"regeracao_pedida_por" uuid
);
--> statement-breakpoint
ALTER TABLE "configuracoes_marca" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "configuracoes_marca" ADD CONSTRAINT "configuracoes_marca_criada_por_usuarios_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_marca" ADD CONSTRAINT "configuracoes_marca_regeracao_pedida_por_usuarios_id_fk" FOREIGN KEY ("regeracao_pedida_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;