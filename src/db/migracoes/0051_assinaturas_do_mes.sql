CREATE TABLE "assinaturas_do_mes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"mes" date NOT NULL,
	"renova" boolean DEFAULT false NOT NULL,
	"paga_em" timestamp with time zone,
	"paga_por" uuid,
	"origem_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assinaturas_do_mes_dia_1" CHECK (extract(day from "assinaturas_do_mes"."mes") = 1)
);
--> statement-breakpoint
ALTER TABLE "assinaturas_do_mes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assinaturas_do_mes" ADD CONSTRAINT "assinaturas_do_mes_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas_do_mes" ADD CONSTRAINT "assinaturas_do_mes_paga_por_usuarios_id_fk" FOREIGN KEY ("paga_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas_do_mes" ADD CONSTRAINT "assinaturas_do_mes_origem_id_assinaturas_do_mes_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."assinaturas_do_mes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_do_mes_assinatura_id_mes_index" ON "assinaturas_do_mes" USING btree ("assinatura_id","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_do_mes_origem_id_index" ON "assinaturas_do_mes" USING btree ("origem_id");--> statement-breakpoint
CREATE INDEX "assinaturas_do_mes_mes_index" ON "assinaturas_do_mes" USING btree ("mes");