"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  ExternalLink,
  GraduationCap,
  X,
} from "lucide-react";

import { linkWhatsappSuporte } from "@/lib/suporte";

/**
 * "Aprenda" no cabeçalho do painel: popup com os vídeos de treinamento (por enquanto, "em
 * breve") e o "Obter ajuda", que abre o WhatsApp do suporte. Dentro do popup, a lista de vídeos
 * é uma segunda tela com "Voltar". Usa o <dialog> nativo (Esc fecha, fundo escurecido).
 */
export function BotaoAprenda() {
  const reduzir = useReducedMotion();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState<"inicio" | "videos">("inicio");

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  function abrir() {
    setTela("inicio");
    setAberto(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-3"
      >
        <GraduationCap aria-hidden="true" className="size-5" />
        {/* Só o ícone até a tela ser larga o bastante para os atalhos não quebrarem linha. */}
        <span className="hidden 2xl:inline">Aprenda</span>
        <span className="sr-only 2xl:hidden">Aprenda</span>
      </button>

      <dialog
        ref={dialogo}
        onClose={() => setAberto(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setAberto(false);
        }}
        aria-labelledby="titulo-aprenda"
        className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-2xl bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        <AnimatePresence>
          {aberto && (
            <motion.div
              initial={reduzir ? false : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex min-h-[380px] flex-col rounded-2xl bg-background text-foreground shadow-2xl"
            >
              <header className="flex items-center gap-3 border-b px-5 py-4">
                {tela === "videos" ? (
                  <button
                    type="button"
                    onClick={() => setTela("inicio")}
                    className="inline-flex h-9 items-center gap-1 rounded-lg pr-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Voltar
                  </button>
                ) : (
                  <span className="flex items-center gap-2 font-semibold text-primary">
                    <GraduationCap aria-hidden="true" className="size-5" />
                    <span id="titulo-aprenda">Aprenda no ClicouAí</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="ml-auto flex size-9 items-center justify-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <X aria-hidden="true" className="size-5" />
                  <span className="sr-only">Fechar</span>
                </button>
              </header>

              <AnimatePresence mode="wait" initial={false}>
                {tela === "inicio" ? (
                  <motion.ul
                    key="inicio"
                    initial={reduzir ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduzir ? undefined : { opacity: 0, x: -12 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-3 p-5"
                  >
                    <li>
                      <button
                        type="button"
                        onClick={() => setTela("videos")}
                        className="flex w-full items-center gap-3 rounded-xl border p-4 text-left hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="flex flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-2 font-semibold text-primary">
                            <Clapperboard aria-hidden="true" className="size-4" />
                            Vídeos treinamento
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Assista tutoriais para te ajudar com a plataforma.
                          </span>
                        </span>
                        <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
                      </button>
                    </li>
                    <li>
                      <a
                        href={linkWhatsappSuporte()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center gap-3 rounded-xl border p-4 text-left hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="flex flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-2 font-semibold text-primary">
                            <CircleHelp aria-hidden="true" className="size-4" />
                            Obter ajuda
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Tire dúvidas ou fale com o nosso suporte no WhatsApp.
                          </span>
                        </span>
                        <ExternalLink aria-hidden="true" className="size-5 text-muted-foreground" />
                      </a>
                    </li>
                  </motion.ul>
                ) : (
                  <motion.div
                    key="videos"
                    initial={reduzir ? false : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduzir ? undefined : { opacity: 0, x: 12 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-1 flex-col gap-4 p-5"
                  >
                    <div className="flex flex-col">
                      <h2 className="flex items-center gap-2 font-semibold">
                        <Clapperboard aria-hidden="true" className="size-5 text-primary" />
                        Vídeos treinamento
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Tutoriais em vídeo para você vender mais no ClicouAí.
                      </p>
                    </div>
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 p-8 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Clapperboard aria-hidden="true" className="size-6" />
                      </span>
                      <p className="font-semibold">Vídeos em breve</p>
                      <p className="text-sm text-muted-foreground">
                        Estamos gravando os primeiros tutoriais. Enquanto isso, fale com a gente em
                        “Obter ajuda”.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </dialog>
    </>
  );
}
