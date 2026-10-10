"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ImageIcon, Loader2, RotateCcw, Star } from "lucide-react";

import { definirCapaAcao } from "@/app/(fotografo)/painel/eventos/capa-acoes";
import { Button } from "@/components/ui/button";

import type { EscolhaDeCapa } from "./grade-fotos-painel";

/**
 * Grava a capa escolhida (ou `null`, para voltar à automática) e atualiza a página. Usado pela
 * grade de fotos ("Usar como capa") e pelo bloco da capa nas Configurações.
 */
export function useEscolhaDeCapa(eventoId: string, fotoId: string | null) {
  const router = useRouter();
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function gravar(novo: string | null, depois?: () => void) {
    setErro(null);
    setGravando(novo ?? "automatica");
    startTransition(async () => {
      const resultado = await definirCapaAcao({ eventoId, fotoId: novo }).catch(() => ({
        erro: "Não foi possível trocar a capa. Tente de novo.",
      }));
      setGravando(null);
      if (resultado.erro) return setErro(resultado.erro);
      depois?.();
      router.refresh();
    });
  }

  const escolha: EscolhaDeCapa = { fotoId, definir: (id) => gravar(id), gravando };
  return { escolha, gravar, gravando, erro };
}

export type FotoParaCapa = { id: string; urlMiniatura: string; nomeArquivo: string };

/** Lote do seletor: evento com centenas de fotos não monta todas de uma vez. */
const POR_VEZ = 24;

/**
 * Capa do evento nas Configurações: mostra a que vale agora nos cartões (a escolhida ou a
 * automática), com "Trocar" (abre as fotos para escolher) e "Remover (usar automática)".
 */
export function CapaDoEvento({
  eventoId,
  escolhidaId,
  atual,
  fotos,
}: {
  eventoId: string;
  /** Foto escolhida pelo dono (pode ainda não estar liberada), ou `null`. */
  escolhidaId: string | null;
  /** O que aparece hoje nos cartões; `null`: nenhuma foto liberada ainda. */
  atual: { urlMiniatura: string; escolhida: boolean } | null;
  /** Fotos que podem virar capa (prontas, não vídeo). */
  fotos: FotoParaCapa[];
}) {
  const { gravar, gravando, erro } = useEscolhaDeCapa(eventoId, escolhidaId);
  const [abrindo, setAbrindo] = useState(false);
  const [mostrando, setMostrando] = useState(POR_VEZ);
  const escolhidaSemValer = escolhidaId !== null && !atual?.escolhida;

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">Capa do evento</h3>
        <p className="text-sm text-muted-foreground">
          A imagem dos cartões do evento na página inicial, na lista de eventos e no seu perfil. Sai
          sempre a prévia com marca d’água. Sem escolha, usamos uma foto liberada do evento.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-muted sm:w-48">
          {atual ? (
            <Image src={atual.urlMiniatura} alt="" fill sizes="192px" className="object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageIcon aria-hidden="true" className="size-6" />
              <span className="text-xs">Nenhuma foto liberada</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm" role="status">
            {atual?.escolhida
              ? "Capa escolhida por você."
              : atual
                ? "Capa automática (uma foto liberada do evento, sempre a mesma)."
                : "Quando a primeira foto for liberada, ela aparece aqui."}
            {escolhidaSemValer && (
              <span className="block text-muted-foreground">
                A foto que você escolheu ainda não foi liberada; enquanto isso, vale a automática.
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="touch"
              variant="outline"
              aria-expanded={abrindo}
              aria-controls={`capa-fotos-${eventoId}`}
              disabled={fotos.length === 0}
              onClick={() => setAbrindo((v) => !v)}
            >
              <Star aria-hidden="true" />
              {abrindo ? "Fechar" : "Trocar"}
            </Button>
            {escolhidaId && (
              <Button
                size="touch"
                variant="ghost"
                disabled={gravando !== null}
                onClick={() => gravar(null)}
              >
                {gravando === "automatica" ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <RotateCcw aria-hidden="true" />
                )}
                Remover (usar automática)
              </Button>
            )}
          </div>
          {fotos.length === 0 && (
            <p className="text-xs text-muted-foreground">Envie fotos para escolher a capa.</p>
          )}
        </div>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {abrindo && (
        <div id={`capa-fotos-${eventoId}`} className="flex flex-col items-center gap-3">
          <ul className="grid w-full grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {fotos.slice(0, mostrando).map((foto) => {
              const ehEscolhida = foto.id === escolhidaId;
              return (
                <li key={foto.id}>
                  <button
                    type="button"
                    disabled={gravando !== null}
                    aria-pressed={ehEscolhida}
                    aria-label={`Usar ${foto.nomeArquivo} como capa`}
                    onClick={() => gravar(foto.id, () => setAbrindo(false))}
                    className="relative block aspect-square w-full overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-pressed:ring-3 aria-pressed:ring-primary"
                  >
                    <Image
                      src={foto.urlMiniatura}
                      alt=""
                      fill
                      sizes="150px"
                      className="object-cover"
                    />
                    {ehEscolhida && (
                      <span className="absolute top-1 left-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        Capa
                      </span>
                    )}
                    {gravando === foto.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 aria-hidden="true" className="size-6 animate-spin" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {fotos.length > mostrando && (
            <Button variant="outline" size="touch" onClick={() => setMostrando((n) => n + POR_VEZ)}>
              Mostrar mais {Math.min(POR_VEZ, fotos.length - mostrando)} de{" "}
              {fotos.length - mostrando}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
