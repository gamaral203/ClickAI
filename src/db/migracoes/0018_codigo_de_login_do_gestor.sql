-- Código de acesso do gestor: segunda etapa obrigatória do login de quem tem o papel admin,
-- enviada por e-mail. Um por usuário, só o HMAC do código, 10 minutos e 5 tentativas.
CREATE TABLE "codigos_de_login" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"login_id" uuid NOT NULL,
	"codigo_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"reenvios" integer DEFAULT 0 NOT NULL,
	"enviado_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codigos_de_login" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "codigos_de_login" ADD CONSTRAINT "codigos_de_login_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;