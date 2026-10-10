// Mapa no navegador com Leaflet e os tiles do OpenStreetMap (docs/arquitetura.md, "Local no
// mapa"). O Leaflet mexe em `window` ao ser importado, então só entra por import dinâmico,
// dentro de um efeito, quando o mapa vai aparecer. O CSS fica no componente que usa o mapa.

import type * as Leaflet from "leaflet";

/** Tiles do OpenStreetMap (a CSP libera este host em img-src: src/lib/csp.ts). */
export const TILES_OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Atribuição obrigatória dos tiles (https://www.openstreetmap.org/copyright). */
export const ATRIBUICAO_OSM =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

/**
 * Marcador em SVG, no azul da marca. O ícone padrão do Leaflet aponta para imagens que o bundler
 * não encontra, então o pino é desenhado aqui (L.divIcon).
 */
const SVG_MARCADOR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" fill="#2362FE" stroke="#ffffff" stroke-width="2"/><circle cx="16" cy="15.5" r="5.5" fill="#ffffff"/></svg>';

export async function carregarLeaflet(): Promise<typeof Leaflet> {
  const modulo = await import("leaflet");
  // O pacote é UMD: dependendo do bundler, o objeto L vem no default.
  return ((modulo as { default?: typeof Leaflet }).default ?? modulo) as typeof Leaflet;
}

export function iconeDoMarcador(L: typeof Leaflet) {
  return L.divIcon({
    html: SVG_MARCADOR,
    className: "marcador-clicouai",
    iconSize: [32, 42],
    iconAnchor: [16, 41],
  });
}

/** Camada de tiles do OSM com a atribuição. Avisa quando nenhum tile consegue carregar. */
export function camadaOsm(L: typeof Leaflet, aoFalhar: () => void) {
  const camada = L.tileLayer(TILES_OSM, { maxZoom: 19, attribution: ATRIBUICAO_OSM });
  let carregados = 0;
  let falhas = 0;
  camada.on("tileload", () => {
    carregados++;
  });
  camada.on("tileerror", () => {
    falhas++;
    if (falhas >= 4 && carregados === 0) aoFalhar();
  });
  return camada;
}
