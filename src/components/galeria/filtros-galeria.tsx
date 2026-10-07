import Link from "next/link";
import { Clock, Folder, ScanFace } from "lucide-react";

import type { FiltroGaleria, OpcoesGaleria } from "@/dados";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  opcoes: OpcoesGaleria;
  filtro: FiltroGaleria;
};

function endereco(slug: string, filtro: FiltroGaleria) {
  const params = new URLSearchParams();
  if (filtro.hora) params.set("hora", filtro.hora);
  if (filtro.naoIdentificadas) params.set("nao-identificadas", "1");
  if (filtro.pasta) params.set("pasta", filtro.pasta);
  const busca = params.toString();
  return `/eventos/${slug}${busca ? `?${busca}` : ""}#galeria`;
}

/** "07h às 08h", com o dia na frente quando o evento passa de um dia ("27/09, 23h às 00h"). */
function rotuloHora(hora: string, comDia: boolean) {
  const [data, hh] = hora.split("T");
  const [, mes, dia] = data.split("-");
  const seguinte = String((Number(hh) + 1) % 24).padStart(2, "0");
  return `${comDia ? `${dia}/${mes}, ` : ""}${hh}h às ${seguinte}h`;
}

const chip =
  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const ativo = "border-primary bg-primary text-primary-foreground";
const inativo = "hover:bg-accent hover:text-accent-foreground";

/**
 * Filtros da galeria aberta, como links: funcionam sem JavaScript e o filtro fica no
 * endereço, para compartilhar. Só aparecem os recursos que o fotógrafo ligou no evento.
 */
export function FiltrosGaleria({ slug, opcoes, filtro }: Props) {
  const horas = opcoes.horas && opcoes.horas.length > 1 ? opcoes.horas : null;
  const naoIdentificadas = opcoes.naoIdentificadas ? opcoes.naoIdentificadas : null;
  const pastas = opcoes.pastas.length > 1 ? opcoes.pastas : null;
  if (!horas && !naoIdentificadas && !pastas) return null;
  const comDia = horas ? new Set(horas.map((h) => h.hora.slice(0, 10))).size > 1 : false;

  return (
    <nav aria-label="Filtrar as fotos" className="flex flex-col gap-3">
      {pastas && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Folder aria-hidden="true" className="size-4" />
            Pasta
          </p>
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
            {pastas.map((p) => (
              <li key={p.id}>
                <Link
                  href={endereco(slug, { ...filtro, pasta: p.id })}
                  aria-current={filtro.pasta === p.id ? "true" : undefined}
                  className={cn(chip, filtro.pasta === p.id ? ativo : inativo)}
                >
                  {p.nome}
                  <span className="opacity-70">({p.total})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
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
