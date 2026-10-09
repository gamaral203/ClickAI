import Image from "next/image";
import { Lock } from "lucide-react";

import { formatarPreco } from "@/lib/formatar";
import type { Meta } from "@/lib/metas";

/**
 * Quadro da meta: moldura escura, fundo azul da marca, logo do ClicouAí e o valor grande. A
 * meta ainda não batida aparece apagada, com o cadeado e quanto falta.
 */
export function QuadroMeta({
  meta,
  conquistado,
  faltaCentavos,
}: {
  meta: Meta;
  conquistado: boolean;
  faltaCentavos: number;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div
        className={`relative aspect-[4/5] rounded-lg border-[10px] border-[#1d1d22] p-2 shadow-lg ${
          conquistado ? "" : "opacity-55 grayscale"
        }`}
        style={{ background: "linear-gradient(145deg, #2a5bff, #0d2a8a)" }}
      >
        <div className="flex h-full flex-col items-center justify-between rounded border border-white/25 p-3 text-white">
          <span className="relative h-7 w-24 rounded bg-white/95">
            <Image
              src="/logo.png"
              alt="ClicouAí"
              fill
              sizes="96px"
              className="object-contain p-1"
            />
          </span>
          <span className="flex flex-col items-center">
            <span className="text-4xl leading-none font-extrabold tracking-tight sm:text-5xl">
              {meta.rotulo}
            </span>
            <span className="mt-1 text-[11px] font-semibold tracking-widest text-highlight uppercase">
              em vendas
            </span>
          </span>
          <span className="text-[10px] tracking-wide text-white/80 uppercase">Meta ClicouAí</span>
        </div>
        {!conquistado && (
          <span className="absolute -top-2 -right-2 flex size-9 items-center justify-center rounded-full bg-[#1d1d22] text-white shadow">
            <Lock aria-hidden="true" className="size-4" />
          </span>
        )}
      </div>
      <figcaption className="text-center text-sm">
        <span className="font-semibold">{formatarPreco(meta.valorCentavos)}</span>
        <span className="block text-muted-foreground">
          {conquistado ? "Conquistado!" : `Faltam ${formatarPreco(faltaCentavos)}`}
        </span>
      </figcaption>
    </figure>
  );
}
