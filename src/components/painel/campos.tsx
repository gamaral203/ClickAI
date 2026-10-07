import { CheckCircle2 } from "lucide-react";

import { Label } from "@/components/ui/label";

// Peças dos formulários de venda do painel (descontos, cupons, pacote, colaboradores), com o
// mesmo visual do formulário do evento.

export const classeSelect =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

export function Campo({
  rotulo,
  id,
  erro,
  ajuda,
  children,
}: {
  rotulo: string;
  id: string;
  erro?: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      ) : (
        ajuda && <p className="text-sm text-muted-foreground">{ajuda}</p>
      )}
    </div>
  );
}

/** Props de acessibilidade de um campo com erro. */
export function propsDeErro(id: string, erro?: string) {
  return {
    id,
    "aria-invalid": Boolean(erro),
    "aria-describedby": erro ? `${id}-erro` : undefined,
  };
}

export function AvisoSalvo({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
    >
      <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
      {children}
    </p>
  );
}

export function Escolha({
  nome,
  valor,
  marcado,
  titulo,
  descricao,
  aoMudar,
}: {
  nome: string;
  valor: string;
  marcado: boolean;
  titulo: string;
  descricao?: string;
  aoMudar?: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-accent">
      <input
        type="radio"
        name={nome}
        value={valor}
        defaultChecked={marcado}
        onChange={aoMudar}
        className="mt-1 size-4 accent-primary"
      />
      <span className="flex flex-col">
        <span className="font-medium">{titulo}</span>
        {descricao && <span className="text-sm text-muted-foreground">{descricao}</span>}
      </span>
    </label>
  );
}
