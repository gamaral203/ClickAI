"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type Slide = {
  src: string;
  alt: string;
  rotulo: string;
  /** Onde ancorar o recorte da foto horizontal no banner. */
  foco?: string;
  /** Foto em pé: no computador aparece inteira à direita, sobre ela mesma desfocada. */
  vertical?: boolean;
  /**
   * Foto horizontal que substitui esta no computador (a partir de 768 px). No celular continua
   * a foto principal; no banner largo do computador, uma foto deitada preenche sem recorte.
   */
  computador?: { src: string; alt: string; rotulo: string; foco?: string };
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
 * Carrossel da página inicial, sem botões: passa sozinho a cada 5 s e, no celular, também
 * dá para deslizar (scroll-snap, sem biblioteca). Para só enquanto o foco do teclado está
 * dentro dele. Para quem prefere menos movimento, troca de foto sem a animação de deslizar.
 */
export function CarrosselInicio({
  slides,
  children,
}: {
  slides: Slide[];
  /** Conteúdo sobre o banner (título, texto e botão). */
  children: React.ReactNode;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const menosMovimento = usePrefereMenosMovimento();
  const [comFoco, setComFoco] = useState(false);

  const irPara = useCallback(
    (indice: number) => {
      const el = trilho.current;
      if (!el) return;
      const destino = (indice + slides.length) % slides.length;
      el.scrollTo({
        left: destino * el.clientWidth,
        behavior: menosMovimento ? "instant" : "smooth",
      });
    },
    [slides.length, menosMovimento],
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
    if (comFoco) return;
    const id = window.setInterval(() => irPara(atual + 1), INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [comFoco, atual, irPara]);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Fotos feitas por fotógrafos do ClicouAí"
      className="relative h-[78svh] max-h-[760px] min-h-[520px] w-full overflow-hidden bg-neutral-900"
      onFocus={() => setComFoco(true)}
      onBlur={() => setComFoco(false)}
    >
      <div
        ref={trilho}
        className="flex h-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto scroll-smooth motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
        aria-live={comFoco ? "polite" : "off"}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}: ${slide.rotulo}${slide.computador ? ` / ${slide.computador.rotulo}` : ""}`}
            className="relative h-full w-full shrink-0 snap-start"
          >
            {slide.computador && (
              <Image
                src={slide.computador.src}
                alt={slide.computador.alt}
                fill
                sizes="100vw"
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "auto"}
                className="hidden object-cover md:block"
                style={{ objectPosition: slide.computador.foco ?? "center" }}
              />
            )}
            <div className={slide.computador ? "contents md:hidden" : "contents"}>
              {slide.vertical ? (
                <>
                  {/* Foto vertical num banner largo: a própria foto desfocada preenche o fundo e
                    ela aparece inteira à direita, sem esticar nem cortar quem está nela. */}
                  <Image
                    src={slide.src}
                    alt=""
                    fill
                    sizes="40vw"
                    loading={i === 0 ? "eager" : "lazy"}
                    className="hidden scale-110 object-cover blur-2xl brightness-75 md:block"
                  />
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    className="object-cover md:object-contain md:object-right lg:pr-[max(1rem,calc((100vw-72rem)/2))]"
                  />
                </>
              ) : (
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  sizes="100vw"
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  className="object-cover"
                  style={{ objectPosition: slide.foco ?? "center" }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Degradê para o texto ser legível sobre qualquer foto. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 md:bg-gradient-to-r md:from-black/80 md:via-black/45 md:to-transparent"
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="mx-auto flex h-full max-w-6xl items-end px-4 pb-24 md:items-center md:pb-0">
          <div className="pointer-events-auto">{children}</div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 pb-5">
          <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-neutral-900">
            {slides[atual]?.computador ? (
              <>
                <span className="md:hidden">{slides[atual].rotulo}</span>
                <span className="hidden md:inline">{slides[atual].computador.rotulo}</span>
              </>
            ) : (
              slides[atual]?.rotulo
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
