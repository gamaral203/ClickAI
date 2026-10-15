"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Images } from "lucide-react";

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
};

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
}: {
  eventoId: string;
  fotos: FotoMinha[];
  /** Formatos com moldura no evento: "Story"/"Feed" em cada foto, para divulgar o evento. */
  formatosMoldura?: FormatoMoldura[];
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
