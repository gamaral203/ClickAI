"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  Download,
  FileText,
  Folder,
  Handshake,
  Images,
  ScanFace,
  Settings,
  Share2,
  Tags,
  Trophy,
  type LucideIcon,
} from "lucide-react";

const ICONES = {
  fotos: Images,
  divulgar: Share2,
  ranking: Trophy,
  rostos: ScanFace,
  originais: Download,
  descontos: Tags,
  colaboradores: Handshake,
  pastas: Folder,
  configuracoes: Settings,
  desempenho: BarChart3,
  relatorio: FileText,
} satisfies Record<string, LucideIcon>;

export type ItemDoMenuDoEvento = {
  icone: keyof typeof ICONES;
  rotulo: string;
  /** Seção desta página (id do elemento) ou… */
  secao?: string;
  /** …outra página do evento. */
  href?: string;
};

/** Altura do topo fixo (barra do painel no celular + este seletor), para a rolagem parar abaixo. */
const MARGEM_ROLAGEM = 128;

/**
 * Seletor de seções da página do evento, como um menu suspenso: a página é longa, e no celular
 * o fotógrafo pula direto para a parte que quer (fotos, divulgação, descontos…). Fica fixo no
 * topo enquanto a página rola. Seção dentro de um <details> fechado é aberta antes de rolar.
 */
export function MenuDoEvento({ itens }: { itens: ItemDoMenuDoEvento[] }) {
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function irPara(item: ItemDoMenuDoEvento) {
    setAberto(false);
    if (!item.secao) return;
    const alvo = document.getElementById(item.secao);
    if (!alvo) return;
    setAtual(item.secao);
    const details = alvo.closest("details");
    if (details) details.open = true;
    const topo = alvo.getBoundingClientRect().top + window.scrollY - MARGEM_ROLAGEM;
    window.scrollTo({ top: Math.max(0, topo), behavior: "smooth" });
  }

  const selecionado = itens.find((i) => i.secao === atual);
  const Icone = selecionado ? ICONES[selecionado.icone] : null;

  return (
    <div
      ref={raiz}
      className="sticky top-14 z-20 -mx-4 bg-background px-4 py-2 md:static md:mx-0 md:px-0 md:py-0"
    >
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        className="flex h-12 w-full items-center gap-2 rounded-xl border bg-card px-4 text-left shadow-xs hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {Icone && <Icone aria-hidden="true" className="size-4 text-primary" />}
        <span className="flex-1 truncate font-medium">
          {selecionado ? selecionado.rotulo : "Ir para uma seção do evento"}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </button>

      {aberto && (
        <ul
          role="listbox"
          className="absolute inset-x-4 z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border bg-background p-1.5 shadow-xl md:inset-x-0"
        >
          {itens.map((item) => {
            const ItemIcone = ICONES[item.icone];
            const ativo = item.secao !== undefined && item.secao === atual;
            const classe = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${
              ativo ? "bg-accent font-medium text-accent-foreground" : ""
            }`;
            return (
              <li key={item.rotulo} role="option" aria-selected={ativo}>
                {item.href ? (
                  <Link href={item.href} className={classe} onClick={() => setAberto(false)}>
                    <ItemIcone
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    {item.rotulo}
                  </Link>
                ) : (
                  <button type="button" onClick={() => irPara(item)} className={classe}>
                    <ItemIcone
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1">{item.rotulo}</span>
                    {ativo && <Check aria-hidden="true" className="size-4 text-primary" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
