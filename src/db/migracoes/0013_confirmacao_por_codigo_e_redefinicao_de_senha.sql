-- Confirmação do e-mail por código de 6 dígitos e "Esqueci a senha". O link de confirmação
-- antigo (confirmacoes_email) sai: contas ainda não confirmadas recebem um código ao entrar.
DROP TABLE "confirmacoes_email" CASCADE;--> statement-breakpoint
CREATE TABLE "codigos_email" (
	"email" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"nome" text,
	"senha_hash" text,
	"papel" "papel",
	"codigo_hash" text NOT NULL,
	"codigo_expira_em" timestamp with time zone NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"enviado_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codigos_email" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "redefinicoes_senha" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redefinicoes_senha" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "codigos_email" ADD CONSTRAINT "codigos_email_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redefinicoes_senha" ADD CONSTRAINT "redefinicoes_senha_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_email_criado_em_index" ON "codigos_email" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "redefinicoes_senha_usuario_id_index" ON "redefinicoes_senha" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "redefinicoes_senha_expira_em_index" ON "redefinicoes_senha" USING btree ("expira_em");