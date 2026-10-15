CREATE TYPE "public"."frequencia_transferencia" AS ENUM('diaria', 'semanal', 'mensal');--> statement-breakpoint
ALTER TABLE "fotografos" ADD COLUMN "antecipar_cartao" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fotografos" ADD COLUMN "transferencia_automatica" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fotografos" ADD COLUMN "frequencia_transferencia" "frequencia_transferencia" DEFAULT 'semanal' NOT NULL;--> statement-breakpoint
ALTER TABLE "fotografos" ADD COLUMN "transferencia_automatica_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fotografos" ADD COLUMN "ultima_transferencia_automatica_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saques" ADD COLUMN "comissao_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saques" ADD COLUMN "taxa_antecipacao_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Saques antigos: separa a taxa já gravada em comissão e antecipação, sem mudar nenhum valor. O
-- normal só tinha comissão; no antecipado, a comissão é a da taxa da conta sobre o bruto e o resto
-- é antecipação (a soma continua igual a taxa_centavos).
UPDATE "saques" AS s SET
  "comissao_centavos" = CASE WHEN s."antecipado" THEN LEAST(s."taxa_centavos", GREATEST(0, (s."bruto_centavos" * f."comissao_pct") / 100)) ELSE s."taxa_centavos" END,
  "taxa_antecipacao_centavos" = CASE WHEN s."antecipado" THEN s."taxa_centavos" - LEAST(s."taxa_centavos", GREATEST(0, (s."bruto_centavos" * f."comissao_pct") / 100)) ELSE 0 END
FROM "fotografos" AS f
WHERE f."id" = s."fotografo_id";
