CREATE TABLE "codigos_de_acao" (
	"usuario_id" uuid NOT NULL,
	"finalidade" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"enviado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "codigos_de_acao_usuario_id_finalidade_pk" PRIMARY KEY("usuario_id","finalidade")
);
--> statement-breakpoint
ALTER TABLE "codigos_de_acao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "codigos_de_acao" ADD CONSTRAINT "codigos_de_acao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Verificação em duas etapas por e-mail (16/10/2026): o app autenticador saiu. Apaga os segredos
-- TOTP e os códigos de emergência. Quem tinha a verificação ligada (mfa_ativado_em) continua com
-- ela ligada, agora com o código enviado ao e-mail no login.
UPDATE "usuarios" SET "mfa_segredo" = NULL, "mfa_ultimo_passo" = NULL;--> statement-breakpoint
DELETE FROM "codigos_recuperacao";
