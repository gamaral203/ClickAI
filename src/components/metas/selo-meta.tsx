import Link from "next/link";
import { Star } from "lucide-react";

import { formatarPreco } from "@/lib/formatar";
import type { SituacaoMetas } from "@/lib/metas";

/**
 * Selo da meta perto do perfil: nível, barra até a próxima meta e o valor. Leva à aba Metas.
 * `compacto` para o cabeçalho; sem ele, a versão larga do topo da aba Metas.
 */
export function SeloMeta({
  metas,
  compacto = false,
}: {
  metas: SituacaoMetas;
  compacto?: boolean;
}) {
  const alvo = metas.proxima?.valorCentavos ?? metas.totalCentavos;
  return (
    <Link
      href="/painel/metas"
      aria-label={`Meta: nível ${metas.nivel}, ${metas.progressoPct}% da próxima meta`}
      className={`flex items-center gap-3 rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
        compacto ? "h-11 py-1 pr-4 pl-1.5" : "w-full p-2 pr-5"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-full bg-white/15 ${
          compacto ? "size-8" : "size-11"
        }`}
      >
        <Star className={compacto ? "size-4" : "size-5"} />
      </span>
      <span className={`flex flex-col gap-1 ${compacto ? "w-36" : "flex-1"}`}>
        <span className={`leading-none font-semibold ${compacto ? "text-xs" : "text-sm"}`}>
          {metas.nivel === "Iniciante" ? "Iniciante" : `Nível ${metas.nivel}`}
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-white/25">
          <span
            className="block h-full rounded-full bg-highlight"
            style={{ width: `${metas.progressoPct}%` }}
          />
        </span>
        <span className={`leading-none opacity-90 ${compacto ? "text-[10px]" : "text-xs"}`}>
          {metas.proxima
            ? `${formatarPreco(metas.totalCentavos)} de ${formatarPreco(alvo)}`
            : `${formatarPreco(metas.totalCentavos)} vendidos`}
        </span>
      </span>
      <span className={`font-bold tabular-nums ${compacto ? "text-sm" : "text-lg"}`}>
        {metas.progressoPct}%
      </span>
    </Link>
  );
}
