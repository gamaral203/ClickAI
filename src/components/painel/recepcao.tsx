"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { Humor } from "@/lib/recepcao";

const MENSAGENS: Record<
  Humor,
  { titulo: string; texto: string; acao: { rotulo: string; href: string }; cor: string }
> = {
  alta: {
    titulo: "Vendas em alta",
    texto: "Seus cliques estão rendendo! Continue assim!",
    acao: { rotulo: "Ver as vendas", href: "/painel/vendas" },
    cor: "bg-highlight/25",
  },
  baixo: {
    titulo: "Movimento baixo",
    texto: "Compartilhe seus eventos. O próximo clique pode vender!",
    acao: { rotulo: "Divulgar meus eventos", href: "/painel/eventos" },
    cor: "bg-primary/10",
  },
  novo: {
    titulo: "Boas-vindas!",
    texto: "Publique seu primeiro evento e comece a vender.",
    acao: { rotulo: "Criar evento", href: "/painel/eventos/novo" },
    cor: "bg-muted",
  },
};

/** Guardada por dia e por humor: a mesma recepção não reaparece no mesmo dia depois de fechada. */
function chave(humor: Humor) {
  return `clicouai:recepcao:${humor}:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Recepção animada ao abrir o painel: um rosto que muda com o momento de vendas do fotógrafo e
 * uma mensagem curta. Dá para fechar; fechada, só volta no dia seguinte (ou se o humor mudar).
 * Com "reduzir movimento" ligado no aparelho, aparece sem animação.
 */
export function Recepcao({ humor, detalhe }: { humor: Humor; detalhe: string | null }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    let fechada = false;
    try {
      fechada = localStorage.getItem(chave(humor)) === "1";
    } catch {
      fechada = false;
    }
    // Lido depois de montar: o servidor não sabe o que o navegador guardou.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!fechada) setVisivel(true);
  }, [humor]);

  if (!visivel) return null;
  const m = MENSAGENS[humor];

  function fechar() {
    setVisivel(false);
    try {
      localStorage.setItem(chave(humor), "1");
    } catch {
      // Sem armazenamento (navegação privada): só fecha agora.
    }
  }

  return (
    <section
      aria-label={m.titulo}
      className={`relative flex flex-col items-center gap-4 rounded-2xl p-5 text-center motion-safe:animate-[recepcao-entra_400ms_ease-out] sm:flex-row sm:text-left ${m.cor}`}
    >
      <Rosto humor={humor} />
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-sm font-bold tracking-wide uppercase">{m.titulo}</p>
        <p className="text-lg font-semibold text-balance">{m.texto}</p>
        {detalhe && <p className="text-sm text-muted-foreground">{detalhe}</p>}
      </div>
      <Link href={m.acao.href} className={buttonVariants({ size: "touch", variant: "outline" })}>
        {m.acao.rotulo}
      </Link>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar a mensagem"
        className="absolute top-2 right-2 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-background/60 hover:text-foreground"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </section>
  );
}

/** Rosto desenhado (SVG): sorriso em alta e nas boas-vindas, boca reta no movimento baixo. */
function Rosto({ humor }: { humor: Humor }) {
  const fundo = humor === "alta" ? "#B8FF32" : humor === "baixo" ? "#9CC1FF" : "#C6CEDD";
  return (
    <svg
      viewBox="0 0 80 80"
      aria-hidden="true"
      className="size-20 shrink-0 motion-safe:animate-[recepcao-pula_1.2s_ease-in-out_2]"
    >
      <circle cx="40" cy="40" r="38" fill={fundo} />
      <circle cx="28" cy="33" r="4" fill="#111216" />
      <circle cx="52" cy="33" r="4" fill="#111216" />
      {humor === "baixo" ? (
        <path
          d="M27 54 Q40 47 53 54"
          stroke="#111216"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M25 47 Q40 62 55 47"
          stroke="#111216"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
