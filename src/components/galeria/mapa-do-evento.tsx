"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

import { camadaOsm, carregarLeaflet, iconeDoMarcador } from "@/lib/mapa-leaflet";

/**
 * Mapa pequeno do local na página pública do evento (OpenStreetMap). O Leaflet e os tiles só
 * carregam quando o bloco chega perto da tela (IntersectionObserver). A roda do mouse não dá
 * zoom (rolar a página não fica preso no mapa) e, no celular, um dedo rola a página em vez de
 * arrastar o mapa. Se os tiles não carregarem, o mapa some e ficam o endereço e os links.
 */
export function MapaDoEvento({
  latitude,
  longitude,
  nome,
}: {
  latitude: number;
  longitude: number;
  nome: string;
}) {
  const div = useRef<HTMLDivElement>(null);
  const [falhou, setFalhou] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const alvo = div.current;
    if (!alvo) return;
    let cancelado = false;
    let mapa: Leaflet.Map | null = null;

    async function montar() {
      const L = await carregarLeaflet();
      if (cancelado || !alvo) return;
      mapa = L.map(alvo, {
        center: [latitude, longitude],
        zoom: 16,
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
      });
      camadaOsm(L, () => setFalhou(true)).addTo(mapa);
      L.marker([latitude, longitude], {
        icon: iconeDoMarcador(L),
        keyboard: false,
        alt: nome,
      }).addTo(mapa);
      setPronto(true);
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        observador.disconnect();
        montar().catch(() => {
          if (!cancelado) setFalhou(true);
        });
      },
      { rootMargin: "200px" },
    );
    observador.observe(alvo);
    return () => {
      cancelado = true;
      observador.disconnect();
      try {
        mapa?.remove();
      } catch {
        // Saindo da página; um erro aqui não pode derrubar a tela.
      }
    };
  }, [latitude, longitude, nome]);

  // Sem mapa, o bloco some (ficam o endereço e os links). Esconde em vez de desmontar: o Leaflet
  // ainda está preso ao elemento.
  return (
    <div
      hidden={falhou}
      className="relative isolate h-[200px] w-full overflow-hidden rounded-lg border bg-muted"
    >
      <div
        ref={div}
        role="region"
        aria-label={`Mapa do local do evento: ${nome}`}
        className="size-full"
      />
      {!pronto && (
        <div aria-hidden="true" className="absolute inset-0 z-[1000] animate-pulse bg-muted" />
      )}
    </div>
  );
}
