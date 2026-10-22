CREATE TYPE "public"."modo_download_gestao" AS ENUM('individual', 'lote');--> statement-breakpoint
CREATE TABLE "downloads_da_gestao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gestor_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"foto_id" uuid,
	"modo" "modo_download_gestao" NOT NULL,
	"quantidade" integer NOT NULL,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "downloads_da_gestao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "downloads_da_gestao" ADD CONSTRAINT "downloads_da_gestao_gestor_id_usuarios_id_fk" FOREIGN KEY ("gestor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads_da_gestao" ADD CONSTRAINT "downloads_da_gestao_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads_da_gestao" ADD CONSTRAINT "downloads_da_gestao_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "downloads_da_gestao_evento_id_criado_em_index" ON "downloads_da_gestao" USING btree ("evento_id","criado_em");--> statement-breakpoint
CREATE INDEX "downloads_da_gestao_gestor_id_criado_em_index" ON "downloads_da_gestao" USING btree ("gestor_id","criado_em");