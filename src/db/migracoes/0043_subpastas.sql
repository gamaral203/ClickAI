ALTER TABLE "pastas" ADD COLUMN "pasta_pai_id" uuid;--> statement-breakpoint
ALTER TABLE "pastas" ADD CONSTRAINT "pastas_pasta_pai_id_pastas_id_fk" FOREIGN KEY ("pasta_pai_id") REFERENCES "public"."pastas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pastas_pasta_pai_id_index" ON "pastas" USING btree ("pasta_pai_id");--> statement-breakpoint
-- Subpastas: no máximo 2 níveis (pasta → subpasta), sempre dentro do mesmo evento. O servidor
-- confere antes (src/dados/loja-moderacao.ts); o gatilho é a última barreira. Trava a linha da
-- pasta de cima (FOR UPDATE) para dois movimentos ao mesmo tempo não criarem o 3º nível.
CREATE FUNCTION "pastas_confere_niveis"() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  pai record;
BEGIN
  IF NEW.pasta_pai_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.pasta_pai_id = NEW.id THEN
    RAISE EXCEPTION 'pasta não pode ficar dentro dela mesma' USING ERRCODE = 'check_violation';
  END IF;
  SELECT evento_id, pasta_pai_id INTO pai FROM pastas WHERE id = NEW.pasta_pai_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW; -- a FK recusa
  END IF;
  IF pai.evento_id <> NEW.evento_id THEN
    RAISE EXCEPTION 'pasta de cima é de outro evento' USING ERRCODE = 'check_violation';
  END IF;
  IF pai.pasta_pai_id IS NOT NULL THEN
    RAISE EXCEPTION 'no máximo 2 níveis de pasta' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM pastas WHERE pasta_pai_id = NEW.id) THEN
    RAISE EXCEPTION 'pasta com subpastas não pode virar subpasta' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "pastas_confere_niveis" BEFORE INSERT OR UPDATE OF "pasta_pai_id", "evento_id" ON "pastas" FOR EACH ROW EXECUTE FUNCTION "pastas_confere_niveis"();
