import type { StatusEvento } from "@/dados/tipos";

const ROTULO: Record<StatusEvento, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  revisao: "Em revisão",
  arquivado: "Arquivado",
};

const ESTILO: Record<StatusEvento, string> = {
  rascunho: "bg-muted text-muted-foreground",
  publicado: "bg-highlight text-highlight-foreground",
  revisao: "bg-destructive/10 text-destructive",
  arquivado: "bg-muted text-muted-foreground",
};

export function StatusEventoSelo({ status }: { status: StatusEvento }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO[status]}`}>
      {ROTULO[status]}
    </span>
  );
}
