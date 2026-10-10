import Link from "next/link";
import { Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FiltroEventos, OpcoesFiltroEventos } from "@/dados";

/** Mesmo visual do <Input>, para os filtros funcionarem como formulário comum, sem JavaScript. */
const classeSelect =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-11 lg:px-2.5 dark:bg-input/30";

/** Tem algum filtro aplicado (busca, data, categoria ou cidade)? */
export function filtrandoEventos(filtro: FiltroEventos) {
  return Boolean(filtro.busca || filtro.data || filtro.categoria || filtro.cidade);
}

/**
 * Busca e filtros de data, cidade e categoria da lista de eventos. É um formulário GET comum
 * (funciona sem JavaScript): usado em /eventos, na página inicial e na página do fotógrafo.
 */
export function FiltrosEventos({
  action,
  filtro,
  opcoes,
  limpar,
  rotuloBusca = "Nome do evento, cidade ou fotógrafo",
  placeholder = "Ex.: corrida, formatura, Curitiba",
  idPrefixo = "filtro",
}: {
  /** Para onde o formulário vai (pode ter #âncora, que o navegador mantém). */
  action: string;
  filtro: FiltroEventos;
  opcoes: OpcoesFiltroEventos;
  /** Link para tirar os filtros; só aparece quando há algum aplicado. */
  limpar: string;
  rotuloBusca?: string;
  placeholder?: string;
  /** Prefixo dos ids dos campos (para não repetir id se houver dois formulários na página). */
  idPrefixo?: string;
}) {
  const id = (campo: string) => `${idPrefixo}-${campo}`;
  const rotulo = "text-xs text-muted-foreground lg:text-sm lg:text-foreground";
  return (
    // No celular: a busca com o botão ao lado e, embaixo, os três filtros numa linha, tudo
    // compacto. No computador: uma linha só, com rótulos maiores.
    <form
      action={action}
      role="search"
      className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end lg:gap-4"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 lg:contents">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={id("busca")} className={rotulo}>
            {rotuloBusca}
          </Label>
          <Input
            id={id("busca")}
            name="busca"
            type="search"
            maxLength={100}
            defaultValue={filtro.busca}
            placeholder={placeholder}
            className="h-10 lg:h-11"
          />
        </div>
        <button
          type="submit"
          className={buttonVariants({
            size: "touch",
            className: "h-10 px-3 lg:order-last lg:h-11 lg:px-5",
          })}
        >
          <Search aria-hidden="true" data-icon="inline-start" />
          <span className="sr-only sm:not-sr-only">Filtrar</span>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 lg:contents">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={id("categoria")} className={rotulo}>
            Categoria
          </Label>
          <select
            id={id("categoria")}
            name="categoria"
            defaultValue={filtro.categoria ?? ""}
            className={classeSelect}
          >
            <option value="">Todas</option>
            {opcoes.categorias.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={id("cidade")} className={rotulo}>
            Cidade
          </Label>
          <select
            id={id("cidade")}
            name="cidade"
            defaultValue={filtro.cidade ?? ""}
            className={classeSelect}
          >
            <option value="">Todas</option>
            {opcoes.cidades.map((c) => (
              <option key={`${c.nome}-${c.estado}`} value={c.nome}>
                {c.nome} – {c.estado}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={id("data")} className={rotulo}>
            Data
          </Label>
          <Input
            id={id("data")}
            name="data"
            type="date"
            defaultValue={filtro.data}
            className="h-10 min-w-0 px-2 lg:h-11 lg:px-3"
          />
        </div>
      </div>
      {filtrandoEventos(filtro) && (
        <Link
          href={limpar}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline lg:col-span-5"
        >
          Limpar filtros
        </Link>
      )}
    </form>
  );
}
