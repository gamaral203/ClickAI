"use client";

import { useState } from "react";

// Gráfico de colunas de vendas por dia (uma série só, então sem legenda: o título diz o que
// é). Segue docs/skills.md e o guia de visualização: colunas de no máximo 24 px com a ponta
// arredondada e a base reta, 2 px de espaço entre colunas, grade fina e discreta, cor da série
// só na marca (texto sempre nas cores de texto), tooltip ao passar o mouse, tocar ou focar, e a
// tabela com os mesmos números para quem usa leitor de tela. A cor vem de --chart-1, que tem
// um tom próprio no modo escuro (validado contra as duas superfícies).

export type PontoVendas = { dia: string; valorCentavos: number; pedidos: number };

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reaisCurto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "2026-10-07" → "07/10". */
function diaCurto(dia: string) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Teto "redondo" do eixo: 1, 2 ou 5 × 10ⁿ reais, para os rótulos serem números limpos. */
function tetoRedondo(maxCentavos: number) {
  const reaisMax = Math.max(maxCentavos / 100, 1);
  const ordem = 10 ** Math.floor(Math.log10(reaisMax));
  const passo = [1, 2, 5, 10].find((m) => m * ordem >= reaisMax) ?? 10;
  return passo * ordem * 100;
}

export function GraficoVendas({
  titulo,
  descricao,
  pontos,
}: {
  titulo: string;
  descricao: string;
  pontos: PontoVendas[];
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const total = pontos.reduce((s, p) => s + p.valorCentavos, 0);
  const pedidos = pontos.reduce((s, p) => s + p.pedidos, 0);
  const teto = tetoRedondo(Math.max(...pontos.map((p) => p.valorCentavos)));
  const marcas = [teto, teto / 2, 0];
  const ponto = ativo === null ? null : pontos[ativo];

  return (
    <figure className="flex flex-col gap-4 rounded-xl border p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex flex-col">
          <span className="font-semibold">{titulo}</span>
          <span className="text-sm text-muted-foreground">{descricao}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          <strong className="text-base text-foreground">{reais.format(total / 100)}</strong> em{" "}
          {pedidos} {pedidos === 1 ? "pedido" : "pedidos"}
        </span>
      </figcaption>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma venda neste período ainda.
        </p>
      ) : (
        <div className="flex gap-2" aria-hidden="true">
          {/* Eixo de valores: três marcas redondas. */}
          <div className="flex h-40 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums">
            {marcas.map((m) => (
              <span key={m} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
                {reaisCurto.format(m / 100)}
              </span>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="relative h-40">
              {/* Grade: linhas finas, só nas marcas do eixo. */}
              {marcas.map((m) => (
                <div
                  key={m}
                  className="absolute inset-x-0 border-t border-border"
                  style={{ bottom: `${(m / teto) * 100}%` }}
                />
              ))}

              <div className="absolute inset-0 flex items-end gap-0.5">
                {pontos.map((p, i) => (
                  <button
                    key={p.dia}
                    type="button"
                    tabIndex={-1}
                    onPointerEnter={() => setAtivo(i)}
                    onPointerLeave={() => setAtivo(null)}
                    onClick={() => setAtivo(ativo === i ? null : i)}
                    // A área de toque é a coluna inteira do dia, maior que a barra.
                    className="group flex h-full min-w-0 flex-1 items-end justify-center"
                  >
                    <span
                      className={`block w-full max-w-6 rounded-t-[4px] bg-chart-1 transition-opacity motion-reduce:transition-none ${
                        ativo !== null && ativo !== i ? "opacity-40" : ""
                      }`}
                      style={{
                        height: `${(p.valorCentavos / teto) * 100}%`,
                        minHeight: p.valorCentavos > 0 ? 2 : 0,
                      }}
                    />
                  </button>
                ))}
              </div>

              {ponto && ativo !== null && (
                <div
                  className="pointer-events-none absolute -top-2 z-10 w-max -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                  style={{
                    left: `clamp(4rem, ${((ativo + 0.5) / pontos.length) * 100}%, calc(100% - 4rem))`,
                  }}
                >
                  <p className="font-semibold">{diaCurto(ponto.dia)}</p>
                  <p className="tabular-nums">{reais.format(ponto.valorCentavos / 100)}</p>
                  <p className="text-muted-foreground">
                    {ponto.pedidos} {ponto.pedidos === 1 ? "pedido" : "pedidos"}
                  </p>
                </div>
              )}
            </div>

            {/* Datas: início, meio e hoje, para não amontoar no celular. */}
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{diaCurto(pontos[0].dia)}</span>
              <span>{diaCurto(pontos[Math.floor(pontos.length / 2)].dia)}</span>
              <span>hoje</span>
            </div>
          </div>
        </div>
      )}

      {/* Os mesmos números em tabela: para leitor de tela e para quem quer o valor exato. */}
      {total > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver em tabela
          </summary>
          <table className="mt-2 w-full">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 font-medium">
                  Dia
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Vendas
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Pedidos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pontos
                .filter((p) => p.valorCentavos > 0)
                .map((p) => (
                  <tr key={p.dia}>
                    <td className="py-1">{diaCurto(p.dia)}</td>
                    <td className="py-1 text-right tabular-nums">
                      {reais.format(p.valorCentavos / 100)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{p.pedidos}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}
