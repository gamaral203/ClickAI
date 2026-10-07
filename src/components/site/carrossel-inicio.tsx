"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

export type Slide = {
  src: string;
  alt: string;
  rotulo: string;
  /** Onde ancorar o recorte (fotos verticais e horizontais dividem a mesma moldura). */
  foco?: string;
};

const INTERVALO_MS = 5000;
const MENOS_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function assinarMenosMovimento(aoMudar: () => void) {
  const consulta = window.matchMedia(MENOS_MOVIMENTO);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

/** Preferência do sistema por menos movimento; no servidor, considera que não. */
function usePrefereMenosMovimento() {
  return useSyncExternalStore(
    assinarMenosMovimento,
    () => window.matchMedia(MENOS_MOVIMENTO).matches,
    () => false,
  );
}

/**
 * Carrossel da página inicial. Rola com scroll-snap (deslize no celular funciona sem
 * biblioteca), passa sozinho a cada 5 s e para quando a pessoa interage, passa o mouse,
 * usa o teclado ou prefere menos movimento.
 */
export function CarrosselInicio({ slides }: { slides: Slide[] }) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  // "auto": segue a preferência do sistema; a pessoa pode forçar tocar ou pausar.
  const [escolha, setEscolha] = useState<"auto" | "tocando" | "pausado">("auto");
  const menosMovimento = usePrefereMenosMovimento();
  const tocando = escolha === "auto" ? !menosMovimento : escolha === "tocando";
  const [pausaTemporaria, setPausaTemporaria] = useState(false);

  const irPara = useCallback(
    (indice: number) => {
      const el = trilho.current;
      if (!el) return;
      const destino = (indice + slides.length) % slides.length;
      el.scrollTo({ left: destino * el.clientWidth, behavior: "smooth" });
    },
    [slides.length],
  );

  // Atualiza o indicador conforme a rolagem (botões, deslize ou teclado).
  useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    const aoRolar = () => setAtual(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => el.removeEventListener("scroll", aoRolar);
  }, []);

  useEffect(() => {
    if (!tocando || pausaTemporaria) return;
    const id = window.setInterval(() => irPara(atual + 1), INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [tocando, pausaTemporaria, atual, irPara]);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Fotos feitas por fotógrafos do ClicouAí"
      className="relative overflow-hidden rounded-2xl bg-muted"
      onMouseEnter={() => setPausaTemporaria(true)}
      onMouseLeave={() => setPausaTemporaria(false)}
      onFocus={() => setPausaTemporaria(true)}
      onBlur={() => setPausaTemporaria(false)}
    >
      <div
        ref={trilho}
        className="flex aspect-[4/5] snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto scroll-smooth motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
        aria-live={tocando && !pausaTemporaria ? "off" : "polite"}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}: ${slide.rotulo}`}
            className="relative h-full w-full shrink-0 snap-start"
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(min-width: 1024px) 480px, (min-width: 640px) 60vw, 100vw"
              // Só a primeira entra logo; as outras carregam quando chegar a vez.
              loading={i === 0 ? "eager" : "lazy"}
              className="object-cover"
              style={{ objectPosition: slide.foco ?? "center" }}
            />
            <span className="absolute bottom-14 left-4 rounded-full bg-background/90 px-3 py-1 text-sm font-semibold">
              {slide.rotulo}
            </span>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/50 to-transparent p-3">
        <button
          type="button"
          onClick={() => setEscolha(tocando ? "pausado" : "tocando")}
          aria-label={tocando ? "Pausar a troca automática" : "Retomar a troca automática"}
          className="flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {tocando ? (
            <Pause aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
        </button>

        <div className="flex items-center gap-1">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => irPara(i)}
              aria-label={`Ir para a foto ${i + 1}: ${slide.rotulo}`}
              aria-current={i === atual}
              className="flex size-8 items-center justify-center rounded-full focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                className={`block h-2 rounded-full transition-all motion-reduce:transition-none ${i === atual ? "w-6 bg-highlight" : "w-2 bg-white/70"}`}
              />
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => irPara(atual - 1)}
            aria-label="Foto anterior"
            className="flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => irPara(atual + 1)}
            aria-label="Próxima foto"
            className="flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
