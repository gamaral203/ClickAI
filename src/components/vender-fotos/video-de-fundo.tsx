"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";

import { VIDEO_DO_TOPO } from "@/lib/vender-fotos";

const CONSULTA_MENOS_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function assinarMovimento(aviso: () => void) {
  const consulta = window.matchMedia(CONSULTA_MENOS_MOVIMENTO);
  consulta.addEventListener("change", aviso);
  return () => consulta.removeEventListener("change", aviso);
}

function assinarAba(aviso: () => void) {
  document.addEventListener("visibilitychange", aviso);
  return () => document.removeEventListener("visibilitychange", aviso);
}

/**
 * Fundo do topo de /vender-fotos: o vídeo em loop, sem som, com a película por cima e o conteúdo
 * (`children`) à frente. O vídeo é decoração: fica fora do foco e do leitor de tela, para fora da
 * tela e com a aba escondida. No HTML do servidor ele sai só com o pôster: o MP4 entra depois de
 * o navegador conferir o pedido de menos movimento, e, com esse pedido, só se a pessoa apertar
 * "Tocar". Se o navegador recusar o autoplay, o pôster fica e o botão oferece tocar.
 */
export function VideoDeFundo({ children }: { children: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const emVista = useInView(raiz);
  // Lidos assim (e não num efeito) para o servidor e a primeira pintura do navegador baterem.
  const menosMovimento = useSyncExternalStore(
    assinarMovimento,
    () => window.matchMedia(CONSULTA_MENOS_MOVIMENTO).matches,
    () => true,
  );
  const abaVisivel = useSyncExternalStore(
    assinarAba,
    () => document.visibilityState === "visible",
    () => true,
  );
  // `null`: a pessoa ainda não escolheu, vale a preferência do aparelho.
  const [escolhaPausar, setEscolhaPausar] = useState<boolean | null>(null);
  const [recusado, setRecusado] = useState(false);

  const pausado = escolhaPausar ?? menosMovimento;
  const carregar = escolhaPausar !== null || !menosMovimento;
  const tocar = !pausado && !recusado && emVista && abaVisivel;

  const tentarTocar = (elemento: HTMLVideoElement) => {
    // O React não garante o `muted` ao hidratar, e sem ele o navegador recusa o autoplay.
    elemento.muted = true;
    elemento.play().catch((erro: unknown) => {
      if (erro instanceof DOMException && erro.name === "NotAllowedError") setRecusado(true);
    });
  };

  useEffect(() => {
    const elemento = video.current;
    if (!elemento) return;
    if (tocar) tentarTocar(elemento);
    else elemento.pause();
  }, [tocar, carregar]);

  const pausadoNaTela = pausado || recusado;

  return (
    <>
      <div ref={raiz} aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        <video
          ref={video}
          src={carregar ? VIDEO_DO_TOPO.src : undefined}
          poster={VIDEO_DO_TOPO.poster}
          autoPlay={tocar}
          muted
          loop
          playsInline
          preload={carregar ? "metadata" : "none"}
          tabIndex={-1}
          disablePictureInPicture
          disableRemotePlayback
          className="pointer-events-none size-full object-cover"
        />
        {/*
          Película do azul profundo. No computador o texto fica à esquerda, então ela alivia só
          depois da coluna do texto. Contraste medido nos quadros mais claros: arquitetura.md.
        */}
        <div className="absolute inset-0 bg-profundo/70 lg:bg-transparent lg:bg-linear-to-r lg:from-profundo/80 lg:via-profundo/68 lg:via-70% lg:to-profundo/30" />
      </div>

      {children}

      <button
        type="button"
        onClick={() => {
          setRecusado(false);
          setEscolhaPausar(!pausadoNaTela);
          // Dentro do clique, o navegador que recusou o autoplay aceita.
          if (pausadoNaTela && video.current?.currentSrc) tentarTocar(video.current);
        }}
        aria-label={pausadoNaTela ? "Tocar o vídeo de fundo" : "Pausar o vídeo de fundo"}
        className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-profundo/80 text-white transition-colors hover:bg-profundo focus-visible:ring-3 focus-visible:ring-white focus-visible:outline-none md:top-6 md:right-6"
      >
        {pausadoNaTela ? (
          <Play aria-hidden="true" className="size-5" />
        ) : (
          <Pause aria-hidden="true" className="size-5" />
        )}
      </button>
    </>
  );
}
