"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { BaixarOriginal } from "./baixar-original";

export type FotoParaVer = {
  id: string;
  nomeArquivo: string;
  /** Prévia grande: a mesma que o cliente vê, com marca d'água. */
  urlPrevia: string;
  /** Foto enviada pelo próprio usuário: só nela aparece "Baixar sem marca d'água". */
  doAutor: boolean;
  /** Situação curta mostrada embaixo da foto (ex.: "Vendida"). */
  detalhe?: string;
};

const SETA =
  "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none";

/**
 * Foto aberta no painel ao clicar na miniatura: a prévia grande, a anterior e a próxima (botões
 * e setas do teclado) e, nas fotos do próprio usuário, "Baixar sem marca d'água" (o servidor
 * confere a autoria de novo: src/servicos/originais-do-dono.ts). É um <dialog> modal: Esc ou um
 * clique fora fecham.
 */
export function VisualizadorFoto({
  eventoId,
  fotos,
  indice,
  aoMudar,
  aoFechar,
}: {
  /** Sem o evento, não há download (a liberação do original é por evento). */
  eventoId?: string;
  fotos: FotoParaVer[];
  /** Foto aberta, ou `null` com o visualizador fechado. */
  indice: number | null;
  aoMudar: (indice: number) => void;
  aoFechar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const posicao = indice ?? -1;
  const foto = posicao >= 0 ? fotos[posicao] : undefined;
  const aberto = foto !== undefined;
  const anterior = aberto && posicao > 0 ? posicao - 1 : null;
  const proxima = aberto && posicao < fotos.length - 1 ? posicao + 1 : null;

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      // No campo do código do app autenticador, as setas movem o cursor.
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft" && anterior !== null) aoMudar(anterior);
      if (e.key === "ArrowRight" && proxima !== null) aoMudar(proxima);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, anterior, proxima, aoMudar]);

  return (
    <dialog
      ref={dialogo}
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      aria-label={foto?.nomeArquivo ?? "Foto"}
      className="m-auto h-[min(92dvh,56rem)] max-h-none w-[min(96vw,70rem)] max-w-none overflow-hidden rounded-2xl bg-background p-0 text-foreground backdrop:bg-black/80"
    >
      {foto && (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b py-1.5 pr-1.5 pl-3">
            <p className="min-w-0 flex-1 truncate text-sm font-medium" title={foto.nomeArquivo}>
              {foto.nomeArquivo}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {posicao + 1} de {fotos.length}
            </span>
            <Button variant="ghost" size="icon" aria-label="Fechar" onClick={aoFechar}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="relative min-h-0 flex-1 bg-black">
            <Image
              key={foto.id}
              src={foto.urlPrevia}
              alt={`Prévia de ${foto.nomeArquivo}`}
              fill
              sizes="(min-width: 1120px) 70rem, 96vw"
              className="object-contain"
            />
            {anterior !== null && (
              <button
                type="button"
                onClick={() => aoMudar(anterior)}
                aria-label="Foto anterior"
                className={`${SETA} left-2`}
              >
                <ChevronLeft aria-hidden="true" className="size-6" />
              </button>
            )}
            {proxima !== null && (
              <button
                type="button"
                onClick={() => aoMudar(proxima)}
                aria-label="Próxima foto"
                className={`${SETA} right-2`}
              >
                <ChevronRight aria-hidden="true" className="size-6" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {foto.detalhe && (
                <span className="rounded-full bg-highlight px-2 py-0.5 font-semibold text-highlight-foreground">
                  {foto.detalhe}
                </span>
              )}
              Prévia com marca d&apos;água, como o cliente vê.
            </p>
            {eventoId && foto.doAutor ? (
              <div className="sm:w-60">
                <BaixarOriginal
                  key={foto.id}
                  eventoId={eventoId}
                  fotoId={foto.id}
                  nomeArquivo={foto.nomeArquivo}
                  rotulo="Baixar sem marca d'água"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Foto de colaborador: só quem a enviou baixa sem marca d&apos;água.
              </p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
