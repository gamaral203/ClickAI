import Link from "next/link";
import { ChevronRight, Clock, Folder, ScanFace } from "lucide-react";

import type { FiltroGaleria, OpcoesGaleria } from "@/dados";
import { enderecoDaGaleria, pastasDoFiltro } from "@/lib/galeria";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  opcoes: OpcoesGaleria;
  filtro: FiltroGaleria;
};

/** Trocar de filtro volta para a página 1 da nova lista. */
const endereco = (slug: string, filtro: FiltroGaleria) => enderecoDaGaleria(slug, filtro);

/** "07h às 08h", com o dia na frente quando o evento passa de um dia ("27/09, 23h às 00h"). */
function rotuloHora(hora: string, comDia: boolean) {
  const [data, hh] = hora.split("T");
  const [, mes, dia] = data.split("-");
  const seguinte = String((Number(hh) + 1) % 24).padStart(2, "0");
  return `${comDia ? `${dia}/${mes}, ` : ""}${hh}h às ${seguinte}h`;
}

const chip =
  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const chipPequeno =
  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const ativo = "border-primary bg-primary text-primary-foreground";
const inativo = "hover:bg-accent hover:text-accent-foreground";

/**
 * Filtros da galeria aberta, como links: funcionam sem JavaScript e o filtro fica no
 * endereço, para compartilhar. Só aparecem os recursos que o fotógrafo ligou no evento.
 */
export function FiltrosGaleria({ slug, opcoes, filtro }: Props) {
  const horas = opcoes.horas && opcoes.horas.length > 1 ? opcoes.horas : null;
  const naoIdentificadas = opcoes.naoIdentificadas ? opcoes.naoIdentificadas : null;
  const pastas = pastasDoFiltro(opcoes.pastas);
  if (!horas && !naoIdentificadas && !pastas) return null;
  const comDia = horas ? new Set(horas.map((h) => h.hora.slice(0, 10))).size > 1 : false;

  return (
    <nav aria-label="Filtrar as fotos" className="flex flex-col gap-3">
      {pastas && <FiltroDePastas slug={slug} pastas={pastas} filtro={filtro} />}
      {horas && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Clock aria-hidden="true" className="size-4" />
            Horário da foto
          </p>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <li>
              <Link
                href={endereco(slug, { ...filtro, hora: undefined })}
                aria-current={!filtro.hora ? "true" : undefined}
                className={cn(chip, !filtro.hora ? ativo : inativo)}
              >
                Qualquer horário
              </Link>
            </li>
            {horas.map(({ hora, total }) => (
              <li key={hora}>
                <Link
                  href={endereco(slug, { ...filtro, hora })}
                  aria-current={filtro.hora === hora ? "true" : undefined}
                  className={cn(chip, filtro.hora === hora ? ativo : inativo)}
                >
                  {rotuloHora(hora, comDia)}
                  <span className="opacity-70">({total})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {naoIdentificadas && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Não se achou pela selfie ou pelo número? Veja as fotos em que ninguém foi reconhecido.
          </p>
          <Link
            href={endereco(slug, { ...filtro, naoIdentificadas: !filtro.naoIdentificadas })}
            aria-current={filtro.naoIdentificadas ? "true" : undefined}
            className={cn(chip, "w-fit", filtro.naoIdentificadas ? ativo : inativo)}
          >
            <ScanFace aria-hidden="true" className="size-4" />
            Só fotos não identificadas
            <span className="opacity-70">({naoIdentificadas})</span>
          </Link>
        </div>
      )}
    </nav>
  );
}

type PastaDaGaleria = OpcoesGaleria["pastas"][number];

/**
 * Pastas da galeria: as de nível 1 em chips; ao escolher uma pasta com subpastas, as subpastas
 * aparecem abaixo, com "Todas" (a pasta e as subpastas juntas). O caminho (Largada › Bateria 1)
 * fica num breadcrumb acima. Tudo em links com `?pasta=<id>` (trocar volta para a página 1).
 */
function FiltroDePastas({
  slug,
  pastas,
  filtro,
}: {
  slug: string;
  pastas: PastaDaGaleria[];
  filtro: FiltroGaleria;
}) {
  const raizes = pastas.filter((p) => p.nivel === 1);
  const escolhida = pastas.find((p) => p.id === filtro.pasta);
  const raiz =
    escolhida?.nivel === 2 ? raizes.find((r) => r.id === escolhida.pastaPaiId) : escolhida;
  const subpastas = raiz ? pastas.filter((p) => p.pastaPaiId === raiz.id) : [];

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Folder aria-hidden="true" className="size-4" />
        Pasta
      </p>
      {escolhida && (
        <nav aria-label="Pasta escolhida" className="text-sm">
          <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
            <li>
              <Link
                href={endereco(slug, { ...filtro, pasta: undefined })}
                className="rounded underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Todas as fotos
              </Link>
            </li>
            {raiz && (
              <li className="flex items-center gap-1">
                <ChevronRight aria-hidden="true" className="size-3.5" />
                {escolhida.nivel === 2 ? (
                  <Link
                    href={endereco(slug, { ...filtro, pasta: raiz.id })}
                    className="rounded underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {raiz.nome}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-semibold text-foreground">
                    {raiz.nome}
                  </span>
                )}
              </li>
            )}
            {escolhida.nivel === 2 && (
              <li className="flex items-center gap-1">
                <ChevronRight aria-hidden="true" className="size-3.5" />
                <span aria-current="page" className="font-semibold text-foreground">
                  {escolhida.nome}
                </span>
              </li>
            )}
          </ol>
        </nav>
      )}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <li>
          <Link
            href={endereco(slug, { ...filtro, pasta: undefined })}
            aria-current={!filtro.pasta ? "true" : undefined}
            className={cn(chip, !filtro.pasta ? ativo : inativo)}
          >
            Todas
          </Link>
        </li>
        {raizes.map((p) => (
          <li key={p.id}>
            <Link
              href={endereco(slug, { ...filtro, pasta: p.id })}
              aria-current={raiz?.id === p.id ? "true" : undefined}
              className={cn(chip, raiz?.id === p.id ? ativo : inativo)}
            >
              {p.nome}
              <span className="opacity-70">({p.total})</span>
            </Link>
          </li>
        ))}
      </ul>
      {raiz && subpastas.length > 0 && (
        <div className="flex flex-col gap-1.5 border-l-2 border-primary/40 pl-3">
          <p className="text-xs font-medium text-muted-foreground">Subpastas de {raiz.nome}</p>
          <ul className="-mr-4 flex gap-2 overflow-x-auto pr-4 pb-1">
            <li>
              <Link
                href={endereco(slug, { ...filtro, pasta: raiz.id })}
                aria-current={escolhida?.id === raiz.id ? "true" : undefined}
                className={cn(chipPequeno, escolhida?.id === raiz.id ? ativo : inativo)}
              >
                Todas
                <span className="opacity-70">({raiz.total})</span>
              </Link>
            </li>
            {subpastas.map((p) => (
              <li key={p.id}>
                <Link
                  href={endereco(slug, { ...filtro, pasta: p.id })}
                  aria-current={escolhida?.id === p.id ? "true" : undefined}
                  className={cn(chipPequeno, escolhida?.id === p.id ? ativo : inativo)}
                >
                  {p.nome}
                  <span className="opacity-70">({p.total})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
