"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

export type SecaoDoEvento = {
  id: string;
  icone: keyof typeof ICONES;
  rotulo: string;
  conteudo: React.ReactNode;
};

export type PaginaDoEvento = {
  icone: keyof typeof ICONES;
  rotulo: string;
  href: string;
};

const PARAMETRO = "secao";

/**
 * A página do evento dividida em seções exclusivas: só a escolhida aparece, em vez de tudo numa
 * rolagem só. No computador, uma barra de abas; no celular, um botão fixo no topo que abre a
 * lista. A seção vai na URL (?secao=…) para a atualização da página e o "voltar" manterem a
 * escolha, e um link com #id (como "Colaboradores" dentro do ranking) troca de seção. Todas as
 * seções ficam montadas (só escondidas): um envio de fotos em andamento não se perde ao trocar.
 */
export function SecoesDoEvento({
  secoes,
  paginas,
}: {
  secoes: SecaoDoEvento[];
  /** Outras páginas do evento (desempenho, relatório), listadas depois das seções. */
  paginas: PaginaDoEvento[];
}) {
  // A seção inicial vem de ?secao=… (igual no servidor e no navegador, sem piscar).
  const parametros = useSearchParams();
  const [ativa, setAtiva] = useState(() => {
    const pedida = parametros.get(PARAMETRO);
    return pedida && secoes.some((s) => s.id === pedida) ? pedida : (secoes[0]?.id ?? "");
  });
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  // Um link com #id (como "Colaboradores" dentro do ranking) troca de seção; o #id só existe no
  // navegador, então a leitura inicial fica para depois da montagem.
  useEffect(() => {
    const aplicar = () => {
      const hash = window.location.hash.slice(1);
      if (hash && secoes.some((s) => s.id === hash)) {
        setAtiva(hash);
        window.scrollTo({ top: 0 });
      }
    };
    const inicial = setTimeout(aplicar, 0);
    window.addEventListener("hashchange", aplicar);
    return () => {
      clearTimeout(inicial);
      window.removeEventListener("hashchange", aplicar);
    };
  }, [secoes]);

  // Fecha a lista ao clicar fora ou apertar Esc.
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

  function escolher(id: string) {
    setAtiva(id);
    setAberto(false);
    const url = new URL(window.location.href);
    url.searchParams.set(PARAMETRO, id);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const atual = secoes.find((s) => s.id === ativa) ?? secoes[0];
  const IconeAtual = atual ? ICONES[atual.icone] : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Celular: botão fixo no topo que abre a lista. */}
      <div ref={raiz} className="sticky top-14 z-20 -mx-4 bg-background px-4 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-haspopup="listbox"
          className="flex h-12 w-full items-center gap-2 rounded-xl border bg-card px-4 text-left shadow-xs hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {IconeAtual && <IconeAtual aria-hidden="true" className="size-4 text-primary" />}
          <span className="flex-1 truncate font-medium">{atual?.rotulo}</span>
          <ChevronDown
            aria-hidden="true"
            className={`size-5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </button>
        {aberto && (
          <ul
            role="listbox"
            className="absolute inset-x-4 z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border bg-background p-1.5 shadow-xl"
          >
            {secoes.map((s) => {
              const Icone = ICONES[s.icone];
              const ativo = s.id === atual?.id;
              return (
                <li key={s.id} role="option" aria-selected={ativo}>
                  <button
                    type="button"
                    onClick={() => escolher(s.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted ${
                      ativo ? "bg-accent font-medium text-accent-foreground" : ""
                    }`}
                  >
                    <Icone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{s.rotulo}</span>
                    {ativo && <Check aria-hidden="true" className="size-4 text-primary" />}
                  </button>
                </li>
              );
            })}
            {paginas.map((p) => {
              const Icone = ICONES[p.icone];
              return (
                <li key={p.href} role="none" className="first:border-t">
                  <Link
                    href={p.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"
                  >
                    <Icone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    {p.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Computador: barra de abas. */}
      <nav aria-label="Seções do evento" className="hidden md:block">
        <ul className="flex flex-wrap gap-1.5 rounded-xl border bg-card p-1.5">
          {secoes.map((s) => {
            const Icone = ICONES[s.icone];
            const ativo = s.id === atual?.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={ativo ? "page" : undefined}
                  onClick={() => escolher(s.id)}
                  className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                    ativo
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icone aria-hidden="true" className="size-4" />
                  {s.rotulo}
                </button>
              </li>
            );
          })}
          {paginas.map((p) => {
            const Icone = ICONES[p.icone];
            return (
              <li key={p.href} className="ml-auto first:ml-0">
                <Link
                  href={p.href}
                  className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Icone aria-hidden="true" className="size-4" />
                  {p.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {secoes.map((s) => (
        <section
          key={s.id}
          id={s.id}
          aria-label={s.rotulo}
          className={s.id === atual?.id ? "flex flex-col gap-6" : "hidden"}
        >
          {s.conteudo}
        </section>
      ))}
    </div>
  );
}
