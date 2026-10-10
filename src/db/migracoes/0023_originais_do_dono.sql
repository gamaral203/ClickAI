CREATE TYPE "public"."modo_originais_do_dono" AS ENUM('vendidas', 'minhas');--> statement-breakpoint
CREATE TABLE "downloads_do_dono" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" uuid NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"modo" "modo_originais_do_dono" NOT NULL,
	"quantidade" integer NOT NULL,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "downloads_do_dono" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "downloads_do_dono" ADD CONSTRAINT "downloads_do_dono_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads_do_dono" ADD CONSTRAINT "downloads_do_dono_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads_do_dono" ADD CONSTRAINT "downloads_do_dono_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "downloads_do_dono_evento_id_criado_em_index" ON "downloads_do_dono" USING btree ("evento_id","criado_em");--> statement-breakpoint
CREATE INDEX "downloads_do_dono_fotografo_id_index" ON "downloads_do_dono" USING btree ("fotografo_id");