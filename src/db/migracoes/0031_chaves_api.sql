CREATE TABLE "chaves_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"prefixo" text NOT NULL,
	"segredo_hash" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usada_em" timestamp with time zone,
	"revogada_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chaves_api" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chaves_api" ADD CONSTRAINT "chaves_api_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chaves_api_segredo_hash_index" ON "chaves_api" USING btree ("segredo_hash");--> statement-breakpoint
CREATE INDEX "chaves_api_fotografo_id_index" ON "chaves_api" USING btree ("fotografo_id");