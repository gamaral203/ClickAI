import Link from "next/link";
import { Star } from "lucide-react";

import { formatarPreco } from "@/lib/formatar";
import type { SituacaoMetas } from "@/lib/metas";

/**
 * Selo largo da meta, no topo da aba Metas: nível, barra até a próxima meta e o valor. Leva à
 * própria aba. No cabeçalho e no topo do painel, a versão compacta é o `CartaoMeta`.
 */
export function SeloMeta({ metas }: { metas: SituacaoMetas }) {
  const alvo = metas.proxima?.valorCentavos ?? metas.totalCentavos;
  return (
    <Link
      href="/painel/metas"
      aria-label={`Meta: nível ${metas.nivel}, ${metas.progressoPct}% da próxima meta`}
      className="flex w-full items-center gap-3 rounded-full bg-primary p-2 pr-5 text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15"
      >
        <Star className="size-5" />
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-sm leading-none font-semibold">
          {metas.nivel === "Iniciante" ? "Iniciante" : `Nível ${metas.nivel}`}
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-white/25">
          <span
            className="block h-full rounded-full bg-highlight"
            style={{ width: `${metas.progressoPct}%` }}
          />
        </span>
        <span className="text-xs leading-none opacity-90">
          {metas.proxima
            ? `${formatarPreco(metas.totalCentavos)} de ${formatarPreco(alvo)}`
            : `${formatarPreco(metas.totalCentavos)} vendidos`}
        </span>
      </span>
      <span className="text-lg font-bold tabular-nums">{metas.progressoPct}%</span>
    </Link>
  );
}
