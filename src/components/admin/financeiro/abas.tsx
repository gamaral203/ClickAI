import Link from "next/link";

import type { TipoPeriodo } from "@/lib/financeiro-plataforma";

// Sub-abas do Financeiro da ClicouAí, pela busca (?aba=): uma página só, com o período no
// endereço. Trocar de aba mantém o período escolhido.

const CAMINHO = "/admin/uso/financeiro";

export const ABAS_FINANCEIRO = [
  "resumo",
  "conciliacao",
  "relatorios",
  "pedidos",
  "ajustes",
] as const;
export type AbaFinanceiro = (typeof ABAS_FINANCEIRO)[number];

const ROTULO_ABA: Record<AbaFinanceiro, string> = {
  resumo: "Resumo",
  conciliacao: "Conciliação",
  relatorios: "Relatórios",
  pedidos: "Pedidos",
  ajustes: "Ajustes",
};

/** O período no endereço: `de`/`ate` só valem com `periodo=personalizado`. */
export type FiltroNaUrl = { periodo: TipoPeriodo; de?: string; ate?: string };

/** Endereço de uma aba do Financeiro, com o período (sem os valores padrão: resumo e mês). */
export function hrefFinanceiro(aba: AbaFinanceiro, filtro?: FiltroNaUrl) {
  const busca = new URLSearchParams();
  if (aba !== "resumo") busca.set("aba", aba);
  if (filtro && filtro.periodo !== "mes") {
    busca.set("periodo", filtro.periodo);
    if (filtro.periodo === "personalizado") {
      if (filtro.de) busca.set("de", filtro.de);
      if (filtro.ate) busca.set("ate", filtro.ate);
    }
  }
  const texto = busca.toString();
  return texto ? `${CAMINHO}?${texto}` : CAMINHO;
}

export function AbasDoFinanceiro({ atual, filtro }: { atual: AbaFinanceiro; filtro: FiltroNaUrl }) {
  return (
    // No celular, as abas rolam para o lado dentro da própria faixa (a página não rola).
    <nav aria-label="Seções do financeiro" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {ABAS_FINANCEIRO.map((a) => (
          <Link
            key={a}
            href={hrefFinanceiro(a, filtro)}
            scroll={false}
            aria-current={atual === a ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${
              atual === a
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {ROTULO_ABA[a]}
          </Link>
        ))}
      </div>
    </nav>
  );
}
