-- Um código por vez: o reenvio do código por e-mail (confirmação do cadastro e acesso do gestor)
-- manda o MESMO código enquanto ele vale. O código fica cifrado (AES-256-GCM, chave do APP_SECRET)
-- só durante a validade; a conferência continua pelo HMAC. Colunas nulas: linhas antigas geram
-- um código novo no próximo envio.
ALTER TABLE "codigos_de_login" ADD COLUMN "codigo_cifrado" text;--> statement-breakpoint
ALTER TABLE "codigos_de_login" ADD COLUMN "codigo_gerado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "codigos_email" ADD COLUMN "codigo_cifrado" text;--> statement-breakpoint
ALTER TABLE "codigos_email" ADD COLUMN "codigo_gerado_em" timestamp with time zone;