// Gráficos do Financeiro da ClicouAí em CSS puro (sem biblioteca): colunas de uma série por mês
// e barras horizontais por categoria. Uma cor só por gráfico (a da marca); o valor negativo fica
// em cinza, abaixo da linha de base, sempre com o número escrito ao passar o mouse e na tabela.
// Cada gráfico tem a tabela com os mesmos números logo abaixo (leitor de tela e conferência).

import { formatarPreco } from "@/lib/formatar";

export type Coluna = { rotulo: string; titulo: string; centavos: number };

/** Colunas de uma série (ex.: volume por mês), com a base em zero e os negativos para baixo. */
export function GraficoColunas({ titulo, colunas }: { titulo: string; colunas: Coluna[] }) {
  const max = Math.max(0, ...colunas.map((c) => c.centavos));
  const min = Math.min(0, ...colunas.map((c) => c.centavos));
  const amplitude = max - min || 1;
  const fracaoPositiva = max / amplitude;
  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4">
      <figcaption className="text-sm font-semibold">{titulo}</figcaption>
      <div
        role="img"
        aria-label={`${titulo}: ${colunas.map((c) => `${c.titulo} ${formatarPreco(c.centavos)}`).join("; ")}`}
        className="flex h-36 items-stretch gap-1"
      >
        {colunas.map((c) => {
          const altura = (Math.abs(c.centavos) / amplitude) * 100;
          return (
            <div
              key={c.rotulo}
              title={`${c.titulo}: ${formatarPreco(c.centavos)}`}
              className="group flex min-w-0 flex-1 flex-col"
            >
              <div
                className="flex flex-col justify-end"
                style={{ height: `${fracaoPositiva * 100}%` }}
              >
                {c.centavos > 0 && (
                  <div
                    className="rounded-t-[4px] bg-primary group-hover:bg-primary/80"
                    style={{ height: `${altura / Math.max(fracaoPositiva, 0.0001)}%` }}
                  />
                )}
              </div>
              <div className="h-px shrink-0 bg-border" />
              <div className="flex flex-1 flex-col justify-start">
                {c.centavos < 0 && (
                  <div
                    className="rounded-b-[4px] bg-muted-foreground/60 group-hover:bg-muted-foreground"
                    style={{ height: `${altura / Math.max(1 - fracaoPositiva, 0.0001)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 text-[10px] text-muted-foreground" aria-hidden="true">
        {colunas.map((c) => (
          <span key={c.rotulo} className="min-w-0 flex-1 truncate text-center">
            {c.rotulo}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Barras horizontais (ex.: custo por categoria), da maior para a menor, com o valor escrito. */
export function BarrasHorizontais({
  itens,
  vazio,
}: {
  itens: { rotulo: string; centavos: number }[];
  vazio: string;
}) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  const total = itens.reduce((s, i) => s + i.centavos, 0);
  const maior = Math.max(1, ...itens.map((i) => i.centavos));
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((i) => (
        <li
          key={i.rotulo}
          className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-2 text-sm"
        >
          <span className="truncate text-muted-foreground">{i.rotulo}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${(i.centavos / maior) * 100}%` }}
            />
          </span>
          <span className="text-right font-semibold whitespace-nowrap tabular-nums">
            {formatarPreco(i.centavos)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {total > 0 ? `${Math.round((i.centavos / total) * 100)}%` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
