import { ChevronDown } from "lucide-react";

/**
 * Seção do painel que abre e fecha (um <details> nativo: funciona sem JavaScript e o estado
 * sobrevive a uma atualização). Serve para as páginas longas, como Perfil e Minha loja, ficarem
 * curtas no celular: só o que a pessoa quer mexer fica aberto.
 */
export function BlocoRecolhivel({
  titulo,
  descricao,
  aberto = false,
  id,
  children,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Começa aberto (a primeira seção, ou a que tem pendência). */
  aberto?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={aberto}
      className="group scroll-mt-32 rounded-xl border bg-card [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-lg font-semibold">{titulo}</span>
          {descricao && <span className="text-sm text-muted-foreground">{descricao}</span>}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t px-5 py-5">{children}</div>
    </details>
  );
}
