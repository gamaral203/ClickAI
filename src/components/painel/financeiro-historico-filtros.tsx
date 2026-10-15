"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

type Opcao = { valor: string; rotulo: string };

type Grupo = {
  /** Nome do parâmetro na URL (com o prefixo `h_`). */
  parametro: string;
  titulo: string;
  opcoes: Opcao[];
  atual: string;
  /** Valor que não vai para a URL (o padrão). */
  padrao: string;
};

/**
 * Filtros do histórico financeiro (período e tipo) como botões. Mudam só os parâmetros `h_` da
 * URL e voltam para a primeira página; os outros parâmetros da página de vendas ficam como
 * estão (vêm prontos do servidor em `outros`, sem precisar de useSearchParams). A tabela é
 * renderizada no servidor; enquanto a nova chega, os botões ficam esmaecidos.
 */
export function FiltrosDoHistorico({
  grupos,
  outros,
  parametroPagina,
}: {
  grupos: Grupo[];
  outros: Record<string, string[]>;
  parametroPagina: string;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [pendente, iniciar] = useTransition();

  function escolher(parametro: string, valor: string) {
    const p = new URLSearchParams();
    for (const [chave, valores] of Object.entries(outros)) {
      for (const v of valores) p.append(chave, v);
    }
    for (const g of grupos) {
      const v = g.parametro === parametro ? valor : g.atual;
      if (v !== g.padrao) p.set(g.parametro, v);
    }
    p.delete(parametroPagina);
    const q = p.toString();
    // Sem rolar para o topo: o histórico fica no fim da página.
    iniciar(() => router.replace(q ? `${caminho}?${q}` : caminho, { scroll: false }));
  }

  return (
    <div
      className={`flex flex-col gap-3 transition-opacity sm:flex-row sm:flex-wrap sm:gap-6 ${
        pendente ? "opacity-60" : ""
      }`}
      aria-busy={pendente}
    >
      {grupos.map((g) => (
        <fieldset key={g.parametro} className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{g.titulo}</legend>
          {/* No celular os botões rolam para o lado em vez de quebrar em várias linhas. */}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {g.opcoes.map((o) => {
              const ativo = o.valor === g.atual;
              return (
                <button
                  key={o.valor}
                  type="button"
                  aria-pressed={ativo}
                  disabled={pendente}
                  onClick={() => !ativo && escolher(g.parametro, o.valor)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    ativo
                      ? "border-primary bg-primary font-medium text-primary-foreground"
                      : "bg-card hover:border-primary/50 hover:bg-accent"
                  }`}
                >
                  {o.rotulo}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
