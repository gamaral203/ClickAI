import { ShieldAlert } from "lucide-react";

/** Aviso discreto, de uma linha, nas páginas que mostram prévias com marca d'água. */
export function AvisoMarcaDagua() {
  return (
    <p className="flex items-center gap-1.5 text-xs leading-tight text-muted-foreground sm:text-sm">
      <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0 text-primary sm:size-4" />
      <span className="min-w-0">
        As fotos têm marca d&apos;água. Não tire print: compre o original em alta qualidade, sem
        marca.
      </span>
    </p>
  );
}
