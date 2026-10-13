import { ROTULO_CONTATO_SUPORTE, type TipoContatoSuporte } from "@/dados/suporte-tipos";

const CORES: Record<TipoContatoSuporte, string> = {
  fotografo: "bg-primary/10 text-primary",
  gestor: "bg-accent text-accent-foreground",
  cliente: "bg-highlight/50 text-highlight-foreground",
  visitante: "bg-muted text-muted-foreground",
};

/** Quem escreveu no chat de ajuda: fotógrafo, gestor, cliente ou visitante sem conta. */
export function SeloContato({ tipo }: { tipo: TipoContatoSuporte }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CORES[tipo]}`}>
      {ROTULO_CONTATO_SUPORTE[tipo]}
    </span>
  );
}
