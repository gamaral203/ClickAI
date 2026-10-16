"use client";

import { useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { FotoDesfocada, type ControleDaLanterna } from "@/components/galeria/foto-desfocada";
import { imagemDoVisualizador } from "@/lib/visualizador";

const TELA_ESTREITA = "(max-width: 767px)";
function assinarTela(aoMudar: () => void) {
  const consulta = window.matchMedia(TELA_ESTREITA);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

/**
 * A prévia da página da foto (link direto, recarregar) com a mesma experiência do visualizador
 * da galeria: desfocada, com a lupa que amplia o pedaço sob o dedo ou o mouse (acima do dedo, no
 * toque) e o mesmo aviso. A imagem é sempre a prévia com marca d'água (a de 1000 px no celular,
 * quando existe); o original nunca chega ao navegador.
 *
 * Só a foto bloqueia a rolagem por toque (touch-none), para segurar e arrastar revelar; fora
 * dela a página rola normalmente.
 */
export function PreviaComLupa({
  id,
  urlPrevia,
  urlPreviaCelular,
  urlMiniatura,
  descricao,
}: {
  id: string;
  urlPrevia: string;
  urlPreviaCelular: string | null;
  urlMiniatura: string;
  descricao: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const lanterna = useRef<ControleDaLanterna>(null);
  const pressionado = useRef<number | null>(null);
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null);
  const reduzir = useReducedMotion() ?? false;
  const telaEstreita = useSyncExternalStore(
    assinarTela,
    () => window.matchMedia(TELA_ESTREITA).matches,
    () => false,
  );

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setTamanho({ largura: r.width, altura: r.height });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const ponto = (e: React.PointerEvent) => ({ x: e.clientX, y: e.clientY });

  return (
    <div
      ref={caixa}
      className="absolute inset-0 touch-none"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pressionado.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        lanterna.current?.revelar(ponto(e), e.pointerType !== "mouse");
      }}
      onPointerMove={(e) => {
        // O mouse revela só de passar; o dedo, enquanto está encostado.
        if (e.pointerType === "mouse" || pressionado.current === e.pointerId) {
          lanterna.current?.revelar(ponto(e), e.pointerType !== "mouse");
        }
      }}
      onPointerUp={(e) => {
        if (pressionado.current !== e.pointerId) return;
        pressionado.current = null;
        if (e.pointerType !== "mouse") lanterna.current?.esconder();
      }}
      onPointerCancel={() => {
        pressionado.current = null;
        lanterna.current?.esconder();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") lanterna.current?.esconder();
      }}
    >
      {tamanho && (
        <FotoDesfocada
          ref={lanterna}
          id={id}
          src={imagemDoVisualizador({ urlPrevia, urlPreviaCelular }, telaEstreita)}
          miniatura={urlMiniatura}
          descricao={descricao}
          tamanho={tamanho}
          reduzir={reduzir}
          dica={
            telaEstreita
              ? "Toque e segure para revelar um detalhe da foto"
              : "Passe o mouse para revelar um detalhe da foto"
          }
        />
      )}
    </div>
  );
}
