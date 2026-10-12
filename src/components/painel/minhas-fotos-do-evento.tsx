"use client";

import Image from "next/image";
import { useState } from "react";
import { Images } from "lucide-react";

import { Button } from "@/components/ui/button";

import { BaixarOriginal } from "./baixar-original";

type FotoMinha = { id: string; nomeArquivo: string; urlMiniatura: string };

const POR_VEZ = 24;

/**
 * Fotos que o colaborador enviou a um evento de outro fotógrafo, com "Baixar original" em cada
 * uma (só o autor baixa o original; o servidor confere de novo). Fechado por padrão, para a
 * página de colaborações não ficar enorme.
 */
export function MinhasFotosDoEvento({ eventoId, fotos }: { eventoId: string; fotos: FotoMinha[] }) {
  const [mostrando, setMostrando] = useState(POR_VEZ);
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
          {fotos.slice(0, mostrando).map((foto) => (
            <li key={foto.id} className="flex flex-col gap-2 rounded-lg border p-2">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                <Image src={foto.urlMiniatura} alt="" fill sizes="200px" className="object-cover" />
              </div>
              <p className="truncate text-xs text-muted-foreground" title={foto.nomeArquivo}>
                {foto.nomeArquivo}
              </p>
              <BaixarOriginal eventoId={eventoId} fotoId={foto.id} nomeArquivo={foto.nomeArquivo} />
            </li>
          ))}
        </ul>
        {restantes > 0 && (
          <Button variant="outline" size="touch" onClick={() => setMostrando((n) => n + POR_VEZ)}>
            Mostrar mais {Math.min(POR_VEZ, restantes)} de {restantes}
          </Button>
        )}
      </div>
    </details>
  );
}
