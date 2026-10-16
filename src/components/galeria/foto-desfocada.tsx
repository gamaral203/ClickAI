"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { prepararPrevia, type PreviaPronta } from "@/components/galeria/previa-desfocada";
import {
  caixaDoCirculo,
  lenteDaRevelacao,
  MIOLO_NITIDO,
  type Caixa,
  type Ponto,
} from "@/lib/desfoque";
import { cn } from "@/lib/utils";

export type ControleDaLanterna = {
  /**
   * Mostra a lupa no ponto (coordenadas da tela). Com `toque`, ela sobe para o dedo não tapar o
   * que está sendo revelado; no mouse, fica centrada no cursor.
   */
  revelar: (ponto: Ponto, toque?: boolean) => void;
  /** Volta a desfocar tudo. */
  esconder: () => void;
  /** O ponto está sobre a foto? */
  contem: (ponto: Ponto) => boolean;
};

/**
 * Foto do visualizador, sempre desfocada: a base é a prévia (com marca d'água) desfocada e
 * pixelada no navegador; a "lanterna" é uma lupa: desenha, num canvas por cima, um círculo com o
 * pedaço da prévia sob o dedo (ou o mouse) ampliado, de borda suave e com um brilho em volta.
 * No toque, o círculo fica acima do dedo (src/lib/desfoque.ts, lenteDaRevelacao). A prévia nunca aparece nítida inteira: o círculo
 * é desenhado pelo código e, sem ele, o canvas fica vazio (não há máscara de CSS que, sem
 * suporte do navegador, deixaria a imagem inteira à mostra).
 *
 * O círculo é redesenhado num requestAnimationFrame, fora do React (sem re-render a cada
 * movimento), limpando só a caixa do círculo anterior.
 */
export function FotoDesfocada({
  id,
  src,
  miniatura,
  descricao,
  tamanho,
  reduzir,
  dica,
  ref,
}: {
  id: string;
  /** Prévia com marca d'água (nunca o original). */
  src: string;
  /** Miniatura (já carregada na grade), desfocada enquanto a prévia chega. */
  miniatura: string;
  descricao: string;
  tamanho: { largura: number; altura: number };
  reduzir: boolean;
  /** Texto do aviso "passe o dedo"; some depois da primeira revelação. */
  dica: string;
  ref?: Ref<ControleDaLanterna>;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const lanterna = useRef<HTMLCanvasElement>(null);
  const pronta = useRef<PreviaPronta | null>(null);
  const [carregada, setCarregada] = useState(false);
  const [mostrarDica, setMostrarDica] = useState(true);
  const estado = useRef<{
    ponto: Ponto | null;
    toque: boolean;
    quadro: number;
    anterior: Caixa | null;
  }>({
    ponto: null,
    toque: false,
    quadro: 0,
    anterior: null,
  });

  // Carrega a prévia e desenha a base desfocada (da memória, se a foto já foi aberta).
  useEffect(() => {
    let ativo = true;
    prepararPrevia(id, src)
      .then((p) => {
        if (!ativo) return;
        pronta.current = p;
        const c = base.current;
        if (c) {
          c.width = p.base.width;
          c.height = p.base.height;
          c.getContext("2d")?.drawImage(p.base, 0, 0);
        }
        setCarregada(true);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [id, src]);

  // Resolução do canvas da lanterna: o tamanho na tela vezes a densidade (até 2x).
  useEffect(() => {
    const c = lanterna.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(tamanho.largura * dpr));
    c.height = Math.max(1, Math.round(tamanho.altura * dpr));
    estado.current.anterior = null;
  }, [tamanho.largura, tamanho.altura]);

  useEffect(() => {
    const e = estado.current;
    return () => cancelAnimationFrame(e.quadro);
  }, []);

  function desenhar() {
    const e = estado.current;
    e.quadro = 0;
    const c = lanterna.current;
    const p = pronta.current;
    const ctx = c?.getContext("2d");
    if (!c || !p || !ctx) return;
    const medida = { largura: c.width, altura: c.height };
    if (e.anterior)
      ctx.clearRect(e.anterior.x, e.anterior.y, e.anterior.largura, e.anterior.altura);
    e.anterior = null;
    if (!e.ponto) return;
    const r = c.getBoundingClientRect();
    const lente = lenteDaRevelacao(
      e.ponto,
      { x: r.x, y: r.y, largura: r.width, altura: r.height },
      medida,
      { largura: p.imagem.naturalWidth, altura: p.imagem.naturalHeight },
      { toque: e.toque },
    );
    if (!lente) return;
    const { circulo, fonte: f, destino: d } = lente;
    // A área limpa no próximo quadro inclui o brilho, que passa um pouco da borda do círculo.
    const area = caixaDoCirculo({ ...circulo, r: circulo.r * 1.2 }, medida);
    if (area.largura === 0 || area.altura === 0) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(p.imagem, f.sx, f.sy, f.sw, f.sh, d.x, d.y, d.largura, d.altura);
    // Recorta o quadrado num círculo de borda suave.
    const gradiente = ctx.createRadialGradient(
      circulo.x,
      circulo.y,
      circulo.r * MIOLO_NITIDO,
      circulo.x,
      circulo.y,
      circulo.r,
    );
    gradiente.addColorStop(0, "rgba(0,0,0,1)");
    gradiente.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = gradiente;
    ctx.fillRect(d.x, d.y, d.largura, d.altura);
    ctx.globalCompositeOperation = "source-over";
    // Brilho da lente: um aro fino claro com um halo verde-limão (cor de destaque da marca).
    ctx.save();
    ctx.beginPath();
    ctx.arc(circulo.x, circulo.y, circulo.r * 0.97, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, circulo.r * 0.02);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.shadowColor = "rgba(184,255,50,0.8)";
    ctx.shadowBlur = circulo.r * 0.16;
    ctx.stroke();
    ctx.restore();
    e.anterior = area;
  }

  useImperativeHandle(
    ref,
    () => ({
      revelar(ponto, toque = false) {
        const c = lanterna.current;
        if (!c || !pronta.current) return;
        estado.current.ponto = ponto;
        estado.current.toque = toque;
        c.style.transition = "none";
        c.style.opacity = "1";
        if (mostrarDica) setMostrarDica(false);
        if (!estado.current.quadro) estado.current.quadro = requestAnimationFrame(desenhar);
      },
      esconder() {
        const c = lanterna.current;
        if (!c) return;
        estado.current.ponto = null;
        // Fade curto ao soltar; sem animação com `prefers-reduced-motion`.
        c.style.transition = reduzir ? "none" : "opacity 160ms ease-out";
        c.style.opacity = "0";
        const limpar = () => {
          if (estado.current.ponto) return;
          if (!estado.current.quadro) estado.current.quadro = requestAnimationFrame(desenhar);
        };
        if (reduzir) limpar();
        else window.setTimeout(limpar, 180);
      },
      contem(ponto) {
        const r = caixa.current?.getBoundingClientRect();
        return Boolean(
          r && ponto.x >= r.left && ponto.x <= r.right && ponto.y >= r.top && ponto.y <= r.bottom,
        );
      },
    }),
    [reduzir, mostrarDica],
  );

  return (
    <div
      ref={caixa}
      role="img"
      aria-label={`${descricao}. Prévia desfocada com marca d'água; toque e segure, ou passe o mouse, para ver um detalhe ampliado.`}
      onContextMenu={(e) => e.preventDefault()}
      className="relative size-full overflow-hidden rounded-xl bg-white/5 select-none"
    >
      {/* Enquanto a prévia chega: a miniatura, também desfocada. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura protegida, sem otimizador */}
      <img
        src={miniatura}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn(
          "absolute inset-0 size-full scale-110 object-cover blur-xl imagem-protegida",
          carregada && "invisible",
        )}
      />
      <canvas
        ref={base}
        aria-hidden="true"
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-200 imagem-protegida motion-reduce:transition-none",
          carregada ? "opacity-100" : "opacity-0",
        )}
      />
      <canvas
        ref={lanterna}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full imagem-protegida"
      />
      {!carregada && (
        <span
          role="status"
          className="absolute inset-0 m-auto flex size-11 items-center justify-center rounded-full bg-black/40"
        >
          <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
          <span className="sr-only">Carregando a prévia</span>
        </span>
      )}
      {carregada && mostrarDica && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
        >
          <Fingerprint className="size-4 text-highlight" />
          {dica}
        </span>
      )}
    </div>
  );
}
