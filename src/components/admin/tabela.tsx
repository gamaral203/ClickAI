// Peças comuns das telas de gestão: cartão de número e tabela com o mesmo visual do painel.

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
    <div className="flex flex-col gap-1 rounded-xl border p-5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icone}
        {titulo}
      </span>
      <span className="text-2xl font-bold tabular-nums sm:text-3xl">{valor}</span>
      {texto && <span className="text-sm text-muted-foreground">{texto}</span>}
    </div>
  );
}

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
  const temLinhas = Array.isArray(children) ? children.length > 0 : Boolean(children);
  if (!temLinhas && vazio) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {vazio}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            {colunas.map((c) => (
              <th
                key={c.rotulo}
                className={`px-4 py-3 font-medium whitespace-nowrap ${c.direita ? "text-right" : ""}`}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

/** Célula padrão; `direita` para valores. */
export function Celula({
  children,
  direita,
  forte,
}: {
  children: React.ReactNode;
  direita?: boolean;
  forte?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 ${direita ? "text-right whitespace-nowrap tabular-nums" : ""} ${forte ? "font-semibold" : ""}`}
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
