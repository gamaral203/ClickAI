CREATE TABLE "modo_manutencao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ativa" boolean NOT NULL,
	"mensagem" text,
	"alterada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"alterada_por" uuid
);
--> statement-breakpoint
ALTER TABLE "modo_manutencao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "modo_manutencao" ADD CONSTRAINT "modo_manutencao_alterada_por_usuarios_id_fk" FOREIGN KEY ("alterada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modo_manutencao_alterada_em_index" ON "modo_manutencao" USING btree ("alterada_em");