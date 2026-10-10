import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

import { formatarPreco, formatarPrecoCompacto } from "@/lib/formatar";
import type { SituacaoMetas } from "@/lib/metas";
import { cn } from "@/lib/utils";

/**
 * Cartão compacto da meta de vendas: ícone do nível | nível, barra e valor | foto ou avatar. A
 * parte da meta leva à aba Metas; a foto, ao perfil (dois links irmãos, nunca um dentro do
 * outro). No cabeçalho do painel (tela larga) tem largura fixa; no topo do painel, ocupa a
 * largura toda no celular (`larguraTotal`) e vai até 384 px a partir do tablet. Altura de 44 px,
 * o alvo de toque mínimo.
 */
export function CartaoMeta({
  metas,
  foto,
  larguraTotal = false,
}: {
  metas: SituacaoMetas;
  /** Foto de perfil ou, sem ela, o avatar (`urlDoAvatar`, src/lib/avatares.ts). */
  foto: string;
  larguraTotal?: boolean;
}) {
  const nivel = metas.nivel === "Iniciante" ? "Iniciante" : `Nível ${metas.nivel}`;
  const alvo = metas.proxima?.valorCentavos ?? metas.totalCentavos;
  const valorCurto = metas.proxima
    ? `${formatarPrecoCompacto(metas.totalCentavos)} / ${formatarPrecoCompacto(alvo)}`
    : `${formatarPrecoCompacto(metas.totalCentavos)} vendidos`;
  const descricao = metas.proxima
    ? `Meta ${nivel}: ${formatarPreco(metas.totalCentavos)} de ${formatarPreco(alvo)}`
    : `Meta ${nivel}: todas as metas batidas, ${formatarPreco(metas.totalCentavos)} vendidos`;

  return (
    <div
      className={cn(
        "flex h-11 items-center gap-1 rounded-xl border bg-card p-1 text-card-foreground shadow-xs",
        larguraTotal ? "w-full sm:max-w-sm" : "w-64",
      )}
    >
      <Link
        href="/painel/metas"
        aria-label={`${descricao} (${metas.progressoPct}%). Ver as metas`}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg pr-2 pl-0.5 transition-colors duration-150 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Star className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-xs leading-none font-bold">{nivel}</span>
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={metas.progressoPct}
            aria-label={descricao}
            className="block h-1 overflow-hidden rounded-full bg-primary/15"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${metas.progressoPct}%` }}
            />
          </span>
          <span className="truncate text-[11px] leading-none text-muted-foreground tabular-nums">
            {valorCurto}
          </span>
        </span>
      </Link>
      <Link
        href="/painel/perfil"
        aria-label="Perfil e recebimento"
        className="relative size-9 shrink-0 overflow-hidden rounded-full bg-accent ring-offset-1 hover:ring-2 hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Image src={foto} alt="" fill sizes="36px" className="object-cover" />
      </Link>
    </div>
  );
}
