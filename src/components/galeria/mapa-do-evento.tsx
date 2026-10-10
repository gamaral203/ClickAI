"use client";

import { useEffect, useRef, useState } from "react";

import { aoRecusarChave, carregarGoogleMaps } from "@/lib/google-maps";
import type { ConfigMapa } from "@/lib/mapa";

/**
 * Mapa pequeno do local na página pública do evento. O Google Maps só carrega quando o bloco
 * chega perto da tela (IntersectionObserver); quem não rola até ele não baixa nada do Google.
 * Se o mapa não carregar, o bloco some e ficam o endereço e os links do Google Maps.
 */
export function MapaDoEvento({
  config,
  latitude,
  longitude,
  nome,
}: {
  config: ConfigMapa;
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
    let mapa: google.maps.Map | null = null;
    const pararDeOuvir = aoRecusarChave(() => setFalhou(true));

    async function montar() {
      await carregarGoogleMaps({ chave: config.chave, nonce: config.nonce });
      const [{ Map, RenderingType }, { AdvancedMarkerElement }] = await Promise.all([
        google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      ]);
      if (cancelado || !alvo) return;
      const centro = { lat: latitude, lng: longitude };
      mapa = new Map(alvo, {
        center: centro,
        zoom: 15,
        mapId: config.idDoMapa,
        renderingType: RenderingType.RASTER,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        // Na página que rola, o mapa não prende o dedo: mover pede dois dedos (ou Ctrl + roda).
        gestureHandling: "cooperative",
      });
      new AdvancedMarkerElement({ map: mapa, position: centro, title: nome });
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
      pararDeOuvir();
      try {
        if (mapa) google.maps.event.clearInstanceListeners(mapa);
      } catch {
        // Com a chave recusada, o Maps pode falhar ao desmontar; não derruba a página.
      }
    };
  }, [config, latitude, longitude, nome]);

  // Sem mapa, o bloco some (ficam o endereço e os links). Esconde em vez de desmontar: o Maps
  // ainda pode estar mexendo no elemento.
  return (
    <div
      hidden={falhou}
      className="relative h-[200px] w-full overflow-hidden rounded-lg border bg-muted"
    >
      <div
        ref={div}
        role="region"
        aria-label={`Mapa do local do evento: ${nome}`}
        className="size-full"
      />
      {!pronto && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted" />}
    </div>
  );
}
