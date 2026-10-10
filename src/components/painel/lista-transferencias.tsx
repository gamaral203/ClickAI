import { formatarDataCurta, formatarPreco } from "@/lib/formatar";

export type Transferencia = {
  id: string;
  /** "Transferência efetuada", "Aguardando o Pix"... */
  situacao: string;
  /** Verdadeiro quando ainda não foi paga: a situação sai em destaque. */
  pendente?: boolean;
  quandoIso: string;
  valorCentavos: number;
  /** Pedaços da linha de baixo, em cinza, separados por pontos (chave, tipo, taxa...). */
  detalhes: string[];
};

/**
 * Lista de saques como extrato de banco: uma linha por transferência (situação, data e hora,
 * valor à direita e os detalhes embaixo). Serve para o fotógrafo (Financeiro) e para a gestão
 * (histórico de saques). Fica igual no celular e no computador, sem virar tabela.
 */
export function ListaTransferencias({ itens }: { itens: Transferencia[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {itens.map((t) => (
        <li key={t.id} className="flex flex-col gap-0.5 px-4 py-3">
          <span
            className={`text-sm ${t.pendente ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            {t.situacao}
          </span>
          <span className="flex items-baseline justify-between gap-3">
            <span className="tabular-nums">
              {formatarDataCurta(t.quandoIso).replace(" ", " · ")}
            </span>
            <span className="font-semibold tabular-nums">{formatarPreco(t.valorCentavos)}</span>
          </span>
          <span className="text-xs text-muted-foreground">{t.detalhes.join(" · ")}</span>
        </li>
      ))}
    </ul>
  );
}
