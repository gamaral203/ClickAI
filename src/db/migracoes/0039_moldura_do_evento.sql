CREATE TYPE "public"."formato_moldura" AS ENUM('story', 'feed');--> statement-breakpoint
CREATE TABLE "molduras_evento" (
	"evento_id" uuid NOT NULL,
	"formato" "formato_moldura" NOT NULL,
	"chave" text NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "molduras_evento_evento_id_formato_pk" PRIMARY KEY("evento_id","formato")
);
--> statement-breakpoint
ALTER TABLE "molduras_evento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "molduras_evento" ADD CONSTRAINT "molduras_evento_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;