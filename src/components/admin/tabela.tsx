// Peças comuns das telas de gestão: cartão de número e tabela com o mesmo visual do painel.

import { Children, cloneElement, isValidElement, type ReactElement } from "react";

import type { Papel } from "@/dados";

export const ROTULO_PAPEL: Record<Papel, string> = {
  cliente: "Cliente",
  fotografo: "Vendedor (fotógrafo)",
  admin: "Gestor",
};

export function CartaoNumero({
  icone,
  titulo,
  valor,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  valor: string;
  texto?: string;
}) {
  return (
    // No celular os cartões ficam dois por linha: menos padding e número um pouco menor.
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border p-3 sm:p-5">
      <span className="flex items-start gap-2 text-xs text-muted-foreground sm:items-center sm:text-sm">
        <span className="mt-0.5 shrink-0 sm:mt-0">{icone}</span>
        {titulo}
      </span>
      <span className="text-lg font-bold break-words tabular-nums sm:text-3xl">{valor}</span>
      {texto && <span className="text-xs text-muted-foreground sm:text-sm">{texto}</span>}
    </div>
  );
}

type PropsCelula = {
  children: React.ReactNode;
  direita?: boolean;
  forte?: boolean;
  /** Preenchido pela Tabela: o nome da coluna, mostrado ao lado do valor no celular. */
  rotulo?: string;
  /** Preenchido pela Tabela na primeira coluna: no celular vira o título do cartão. */
  principal?: boolean;
};

/**
 * Tabela das telas de painel. No computador, uma tabela comum; no celular (abaixo de 768 px),
 * cada linha vira um cartão: a primeira coluna é o título e as outras aparecem como
 * "coluna: valor", uma embaixo da outra, sem rolar para o lado.
 */
export function Tabela({
  colunas,
  vazio,
  children,
}: {
  /** Rótulo da coluna; `direita` alinha valores em dinheiro. */
  colunas: { rotulo: string; direita?: boolean }[];
  vazio?: string;
  children: React.ReactNode;
}) {
  const linhas = Children.toArray(children).filter(isValidElement);
  if (linhas.length === 0 && vazio) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {vazio}
      </p>
    );
  }
  return (
    <div className="md:overflow-x-auto md:rounded-xl md:border">
      <table className="block w-full text-sm md:table">
        <thead className="sr-only bg-muted/50 text-left text-muted-foreground md:not-sr-only md:table-header-group">
          <tr>
            {colunas.map((c) => (
              <th
                key={c.rotulo}
                scope="col"
                className={`px-4 py-3 font-medium whitespace-nowrap ${c.direita ? "text-right" : ""}`}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        {/* No celular, os cartões são compactos: pouco espaço entre linhas e entre cartões. */}
        <tbody className="flex flex-col gap-2 md:table-row-group md:divide-y">
          {linhas.map((linha) => {
            const tr = linha as ReactElement<{ children?: React.ReactNode; className?: string }>;
            let indice = 0;
            const celulas = Children.map(tr.props.children, (celula) => {
              if (!isValidElement(celula)) return celula;
              const coluna = colunas[indice];
              const principal = indice === 0;
              indice++;
              return celula.type === Celula
                ? cloneElement(celula as ReactElement<PropsCelula>, {
                    rotulo: coluna?.rotulo,
                    principal,
                  })
                : celula;
            });
            return cloneElement(
              tr,
              {
                className:
                  "flex flex-col rounded-lg border px-3 py-2 md:table-row md:rounded-none md:border-0 md:p-0",
              },
              celulas,
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Célula padrão; `direita` para valores. */
export function Celula({ children, direita, forte, rotulo, principal }: PropsCelula) {
  return (
    <td
      data-rotulo={principal ? undefined : rotulo}
      className={[
        "md:table-cell md:px-4 md:py-3",
        principal
          ? "pb-1 font-medium md:font-normal"
          : // No celular: "Rótulo ........ valor" numa linha só, com o rótulo em cinza e menor.
            "flex items-baseline justify-between gap-3 py-px before:shrink-0 before:text-xs before:text-muted-foreground before:content-[attr(data-rotulo)] md:before:content-none",
        // No celular o valor fica à direita do rótulo; no computador, só os valores em dinheiro.
        direita
          ? "text-right tabular-nums md:whitespace-nowrap"
          : principal
            ? ""
            : "text-right md:text-left",
        forte ? "font-semibold" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

/** "12345678901" → "***.456.789-**": a equipe confere o documento sem vê-lo inteiro. */
export function mascararDocumento(digitos: string) {
  if (digitos.length === 11) return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
  if (digitos.length === 14) return `**.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/****-**`;
  return "—";
}
