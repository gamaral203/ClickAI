CREATE TABLE "sessoes_revogadas" (
	"jti" text PRIMARY KEY NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessoes_revogadas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "versao_sessao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "sessoes_revogadas_expira_em_index" ON "sessoes_revogadas" USING btree ("expira_em");