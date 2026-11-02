CREATE TABLE "limites_de_taxa" (
	"chave" text PRIMARY KEY NOT NULL,
	"proximo_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "limites_de_taxa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "rostos_tentativas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fotos" ADD COLUMN "rostos_tentar_em" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "fotos_fila_rostos_idx" ON "fotos" USING btree ("criado_em") WHERE status = 'pronta' and rostos_indexados_em is null;