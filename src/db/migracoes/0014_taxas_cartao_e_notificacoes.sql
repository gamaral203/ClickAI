CREATE TABLE "inscricoes_push" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inscricoes_push" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fotografos" ALTER COLUMN "comissao_pct" SET DEFAULT 8;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "acrescimo_cartao_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inscricoes_push" ADD CONSTRAINT "inscricoes_push_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inscricoes_push_endpoint_index" ON "inscricoes_push" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "inscricoes_push_usuario_id_index" ON "inscricoes_push" USING btree ("usuario_id");