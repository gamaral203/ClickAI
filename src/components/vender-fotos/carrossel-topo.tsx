"use client";

import Image from "next/image";
import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import type { SlideTopo, SlideVideo } from "@/lib/vender-fotos";

const TEMPO_POR_FOTO_MS = 5000;
/** O vídeo passa ao terminar; este limite só evita ficar parado se ele não conseguir tocar. */
const TEMPO_MAXIMO_VIDEO_MS = 60_000;
const ARRASTE_MINIMO_PX = 50;

const BOTAO =
  "flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white focus-visible:outline-none";

function assinarMovimento(aviso: () => void) {
  const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
  consulta.addEventListener("change", aviso);
  return () => consulta.removeEventListener("change", aviso);
}

function assinarAba(aviso: () => void) {
  document.addEventListener("visibilitychange", aviso);
  return () => document.removeEventListener("visibilitychange", aviso);
}

/**
 * Carrossel do topo de /vender-fotos. Passa sozinho só com a página à vista e sem pedido de menos
 * movimento; para ao passar o mouse ou focar nele e tem botão de pausar. Setas do teclado e arrastar
 * com o dedo também trocam o slide. Os slides ficam em src/lib/vender-fotos.ts.
 */
export function CarrosselTopo({ slides }: { slides: SlideTopo[] }) {
  const raiz = useRef<HTMLDivElement>(null);
  const emVista = useInView(raiz, { amount: 0.25 });
  // Lidos assim (e não num efeito) para o servidor e a primeira pintura do navegador baterem.
  const menosMovimento = useSyncExternalStore(
    assinarMovimento,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const abaVisivel = useSyncExternalStore(
    assinarAba,
    () => document.visibilityState === "visible",
    () => true,
  );
  const [ativo, setAtivo] = useState(0);
  // `null`: a pessoa ainda não escolheu, vale a preferência do aparelho.
  const [escolhaPausar, setEscolhaPausar] = useState<boolean | null>(null);
  const [comMouse, setComMouse] = useState(false);
  const [comFoco, setComFoco] = useState(false);

  const total = slides.length;
  const pausado = escolhaPausar ?? menosMovimento;
  const podeTocar = !pausado && emVista && abaVisivel;
  const passando = podeTocar && !comMouse && !comFoco && total > 1;
  const slideAtivo = slides[ativo];

  const irPara = (i: number) => setAtivo((i + total) % total);

  useEffect(() => {
    if (!passando) return;
    const tempo = slideAtivo.tipo === "video" ? TEMPO_MAXIMO_VIDEO_MS : TEMPO_POR_FOTO_MS;
    const relogio = setTimeout(() => setAtivo((a) => (a + 1) % total), tempo);
    return () => clearTimeout(relogio);
  }, [passando, ativo, slideAtivo.tipo, total]);

  return (
    <div
      ref={raiz}
      role="group"
      aria-roledescription="carrossel"
      aria-label="Eventos fotografados"
      onPointerEnter={(e) => e.pointerType === "mouse" && setComMouse(true)}
      onPointerLeave={() => setComMouse(false)}
      onFocus={() => setComFoco(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setComFoco(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") irPara(ativo - 1);
        if (e.key === "ArrowRight") irPara(ativo + 1);
      }}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-[3px] border-white bg-profundo shadow-[0_18px_40px_-14px_rgb(3_10_35/0.65)] lg:aspect-[5/6]"
    >
      <motion.div
        className="absolute inset-0 touch-pan-y"
        onPanEnd={(_, { offset }) => {
          if (Math.abs(offset.x) < ARRASTE_MINIMO_PX) return;
          irPara(ativo + (offset.x < 0 ? 1 : -1));
        }}
      >
        {slides.map((slide, i) => {
          const eAtivo = i === ativo;
          // Só o slide à vista e os vizinhos ficam montados: os outros nem são baixados.
          const vizinho = i === (ativo + 1) % total || i === (ativo - 1 + total) % total;
          if (!eAtivo && !vizinho) return null;
          return (
            <motion.div
              key={slide.tipo === "imagem" ? slide.imagem.src : slide.src}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${total}: ${slide.rotulo}`}
              aria-hidden={!eAtivo}
              inert={!eAtivo}
              initial={false}
              animate={{ opacity: eAtivo ? 1 : 0 }}
              transition={{ duration: menosMovimento ? 0 : 0.5, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              {slide.tipo === "imagem" ? (
                <Image
                  src={slide.imagem.src}
                  alt={slide.imagem.alt}
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  priority={i === 0}
                  draggable={false}
                  className="object-cover"
                  style={{ objectPosition: slide.imagem.foco }}
                />
              ) : (
                <VideoDoSlide
                  slide={slide}
                  tocar={eAtivo && podeTocar}
                  controles={menosMovimento && total === 1}
                  aoTerminar={() => irPara(i + 1)}
                />
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* A legenda só é anunciada quando a troca foi pedida: passando sozinho, atrapalharia. */}
      <p aria-live={passando ? "off" : "polite"} className="sr-only">
        {`Slide ${ativo + 1} de ${total}: ${slideAtivo.rotulo}`}
      </p>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-profundo/90 to-transparent px-2 pt-10 pb-2 text-white">
        <span
          aria-hidden="true"
          className="min-w-0 truncate pl-2 text-sm font-semibold [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]"
        >
          {slideAtivo.rotulo}
        </span>
        {total > 1 && (
          <div className="flex shrink-0 items-center rounded-full bg-profundo/70">
            <button
              type="button"
              onClick={() => irPara(ativo - 1)}
              aria-label="Slide anterior"
              className={BOTAO}
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <span aria-hidden="true" className="px-1 text-xs font-semibold tabular-nums">
              {ativo + 1}/{total}
            </span>
            <button
              type="button"
              onClick={() => irPara(ativo + 1)}
              aria-label="Próximo slide"
              className={BOTAO}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setEscolhaPausar(!pausado)}
              aria-label={pausado ? "Continuar o carrossel" : "Pausar o carrossel"}
              className={BOTAO}
            >
              {pausado ? (
                <Play aria-hidden="true" className="size-5" />
              ) : (
                <Pause aria-hidden="true" className="size-5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sempre sem som e sem o atributo `autoPlay`: quem manda tocar e parar é o carrossel, que para com
 * o vídeo fora da tela ou em pausa. Com pedido de menos movimento, ele fica no pôster e a pessoa
 * toca pelo botão do carrossel; os controles do vídeo, que a barra de baixo cobriria, só aparecem
 * se ele for o único slide.
 */
function VideoDoSlide({
  slide,
  tocar,
  controles,
  aoTerminar,
}: {
  slide: SlideVideo;
  tocar: boolean;
  controles: boolean;
  aoTerminar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const elemento = video.current;
    if (!elemento) return;
    if (tocar) {
      // O navegador pode recusar: o pôster continua à vista e o carrossel segue.
      elemento.play().catch(() => {});
    } else {
      elemento.pause();
    }
  }, [tocar]);

  return (
    <video
      ref={video}
      poster={slide.poster}
      muted
      playsInline
      preload="none"
      controls={controles}
      aria-label={slide.alt}
      onEnded={aoTerminar}
      // O vídeo é 16:9 e mostra telas com texto: inteiro, com faixas, em vez de cortado. No celular e
      // no tablet fica no alto, para a barra de baixo cobrir o mínimo dele.
      className="size-full bg-black object-contain object-top lg:object-center"
    >
      <source src={slide.src} type="video/mp4" />
    </video>
  );
}
