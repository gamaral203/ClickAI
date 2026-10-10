"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Rocket, X } from "lucide-react";

import { enviarSugestaoAcao } from "@/app/(fotografo)/painel/suporte-acoes";
import { Button } from "@/components/ui/button";

/**
 * Foguete no cabeçalho do painel: abre um popup para o fotógrafo mandar uma sugestão de melhoria
 * do site. Usa o <dialog> nativo (foco preso, Esc fecha, fundo escurecido).
 */
export function BotaoSugestao() {
  const reduzir = useReducedMotion();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const [enviando, startEnvio] = useTransition();

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  function abrir() {
    setErro(null);
    setEnviada(false);
    setAberto(true);
  }

  function enviar() {
    setErro(null);
    startEnvio(async () => {
      const r = await enviarSugestaoAcao(texto).catch(() => ({
        erro: "Não foi possível enviar. Tente de novo.",
      }));
      if (r.erro) return setErro(r.erro);
      setTexto("");
      setEnviada(true);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Sugerir uma melhoria"
        className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Rocket aria-hidden="true" className="size-5" />
        <span className="sr-only">Sugerir uma melhoria</span>
      </button>

      <dialog
        ref={dialogo}
        onClose={() => setAberto(false)}
        onClick={(e) => {
          // Clique no fundo escurecido (fora da caixa) fecha.
          if (e.target === e.currentTarget) setAberto(false);
        }}
        aria-labelledby="titulo-sugestao"
        className="m-auto max-h-[85dvh] w-[min(480px,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        <AnimatePresence>
          {aberto && (
            <motion.div
              initial={reduzir ? false : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-4 rounded-2xl bg-background p-6 text-foreground shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Rocket aria-hidden="true" className="size-5" />
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  <h2 id="titulo-sugestao" className="text-lg font-bold">
                    Sugestão de melhoria
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    O que deixaria o ClicouAí melhor para você? A equipe lê todas as sugestões.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="flex size-9 items-center justify-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <X aria-hidden="true" className="size-5" />
                  <span className="sr-only">Fechar</span>
                </button>
              </div>

              {enviada ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
                  <motion.span
                    initial={reduzir ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  >
                    <CheckCircle2 aria-hidden="true" className="size-12 text-primary" />
                  </motion.span>
                  <p className="font-semibold">Sugestão enviada. Obrigado! 🚀</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="touch" onClick={() => setEnviada(false)}>
                      Mandar outra
                    </Button>
                    <Button size="touch" onClick={() => setAberto(false)}>
                      Fechar
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    enviar();
                  }}
                  className="flex flex-col gap-3"
                >
                  <label htmlFor="texto-sugestao" className="sr-only">
                    A sua sugestão
                  </label>
                  <textarea
                    id="texto-sugestao"
                    autoFocus
                    rows={5}
                    maxLength={2000}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Ex.: poder mudar o preço de várias fotos de uma vez"
                    className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  />
                  {erro && (
                    <p role="alert" className="text-sm text-destructive">
                      {erro}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {texto.length}/2000
                    </span>
                    <Button type="submit" size="touch" disabled={enviando || !texto.trim()}>
                      {enviando ? (
                        <Loader2 aria-hidden="true" className="animate-spin" />
                      ) : (
                        <Rocket aria-hidden="true" />
                      )}
                      Enviar sugestão
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </dialog>
    </>
  );
}
