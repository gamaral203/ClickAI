CREATE TABLE "codigos_recuperacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"codigo_hash" text NOT NULL,
	"usado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "codigos_recuperacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "mfa_segredo" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "mfa_ativado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "mfa_ultimo_passo" integer;--> statement-breakpoint
ALTER TABLE "codigos_recuperacao" ADD CONSTRAINT "codigos_recuperacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "codigos_recuperacao_codigo_hash_index" ON "codigos_recuperacao" USING btree ("codigo_hash");--> statement-breakpoint
CREATE INDEX "codigos_recuperacao_usuario_id_index" ON "codigos_recuperacao" USING btree ("usuario_id");