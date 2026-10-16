"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Images } from "lucide-react";

import { moverParaPastaAcao } from "@/app/(fotografo)/painel/eventos/pastas-acoes";
import { Button } from "@/components/ui/button";
import type { FormatoMoldura } from "@/lib/moldura";

import { BaixarComMoldura } from "./baixar-com-moldura";
import { BaixarOriginal } from "./baixar-original";
import { VisualizadorFoto, type FotoParaVer } from "./visualizador-foto";

type FotoMinha = {
  id: string;
  nomeArquivo: string;
  urlMiniatura: string;
  urlPrevia: string;
  tipo: "foto" | "video";
  pastaId: string | null;
};

type PastaOpcao = { id: string; nome: string };

const POR_VEZ = 24;

/**
 * Fotos que o colaborador enviou a um evento de outro fotógrafo, com "Baixar original" em cada
 * uma (só o autor baixa o original; o servidor confere de novo). Fechado por padrão, para a
 * página de colaborações não ficar enorme.
 */
export function MinhasFotosDoEvento({
  eventoId,
  fotos,
  formatosMoldura = [],
  pastas = [],
}: {
  eventoId: string;
  fotos: FotoMinha[];
  /** Formatos com moldura no evento: "Story"/"Feed" em cada foto, para divulgar o evento. */
  formatosMoldura?: FormatoMoldura[];
  /** Pastas do evento (o dono cria): o colaborador só põe nelas as fotos que enviou. */
  pastas?: PastaOpcao[];
}) {
  const [mostrando, setMostrando] = useState(POR_VEZ);
  const [aberta, setAberta] = useState<number | null>(null);
  const paraVer = useMemo<FotoParaVer[]>(
    () =>
      fotos.map((f) => ({
        id: f.id,
        nomeArquivo: f.nomeArquivo,
        urlPrevia: f.urlPrevia,
        doAutor: true,
      })),
    [fotos],
  );
  if (fotos.length === 0) return null;
  const restantes = fotos.length - mostrando;
  return (
    <details className="group rounded-lg border">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium">
        <Images aria-hidden="true" className="size-4 text-primary" />
        Minhas fotos neste evento ({fotos.length})
      </summary>
      <div className="flex flex-col items-center gap-4 border-t p-4">
        <p className="w-full text-sm text-muted-foreground">
          Baixe o original, sem marca d&apos;água, das fotos que você enviou.
        </p>
        <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.slice(0, mostrando).map((foto, i) => (
            <li key={foto.id} className="flex flex-col gap-2 rounded-lg border p-2">
              <button
                type="button"
                onClick={() => setAberta(i)}
                aria-label={`Abrir ${foto.nomeArquivo}`}
                className="relative aspect-square cursor-zoom-in overflow-hidden rounded-md bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Image src={foto.urlMiniatura} alt="" fill sizes="200px" className="object-cover" />
              </button>
              <p className="truncate text-xs text-muted-foreground" title={foto.nomeArquivo}>
                {foto.nomeArquivo}
              </p>
              {pastas.length > 0 && <SeletorPasta foto={foto} pastas={pastas} />}
              <BaixarOriginal eventoId={eventoId} fotoId={foto.id} nomeArquivo={foto.nomeArquivo} />
              {foto.tipo === "foto" && (
                <BaixarComMoldura
                  eventoId={eventoId}
                  fotoId={foto.id}
                  nomeArquivo={foto.nomeArquivo}
                  formatos={formatosMoldura}
                />
              )}
            </li>
          ))}
        </ul>
        {restantes > 0 && (
          <Button variant="outline" size="touch" onClick={() => setMostrando((n) => n + POR_VEZ)}>
            Mostrar mais {Math.min(POR_VEZ, restantes)} de {restantes}
          </Button>
        )}
      </div>
      <VisualizadorFoto
        eventoId={eventoId}
        fotos={paraVer}
        indice={aberta}
        aoMudar={setAberta}
        aoFechar={() => setAberta(null)}
      />
    </details>
  );
}

/** Pasta da foto: muda na hora (o servidor confere que a foto é deste colaborador). */
function SeletorPasta({ foto, pastas }: { foto: FotoMinha; pastas: PastaOpcao[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [movendo, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Pasta de ${foto.nomeArquivo}`}
        value={foto.pastaId ?? ""}
        disabled={movendo}
        onChange={(e) => {
          const destino = e.target.value || null;
          setErro(null);
          startTransition(async () => {
            const resultado = await moverParaPastaAcao([foto.id], destino).catch(() => ({
              erro: "Não foi possível mover.",
            }));
            if (resultado.erro) setErro(resultado.erro);
            router.refresh();
          });
        }}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:h-10"
      >
        <option value="">Sem pasta</option>
        {pastas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
