import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VIDEO_DO_TOPO } from "@/lib/vender-fotos";

import { VideoDeFundo } from "./video-de-fundo";

describe("VideoDeFundo no HTML do servidor", () => {
  const html = renderToStaticMarkup(
    createElement(VideoDeFundo, null, createElement("h1", null, "Título")),
  );

  it("sai só com o pôster: quem pede menos movimento não baixa o MP4", () => {
    expect(html).toContain(`poster="${VIDEO_DO_TOPO.poster}"`);
    expect(html).not.toContain(".mp4");
    expect(html).not.toMatch(/autoplay/i);
  });

  it("deixa o vídeo fora do leitor de tela e do foco, e o conteúdo à vista", () => {
    expect(html).toMatch(/aria-hidden="true"[^>]*><video/);
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain('aria-label="Tocar o vídeo de fundo"');
  });

  it("usa só arquivos do próprio site", () => {
    expect(VIDEO_DO_TOPO.src).toBe("/vitrine/video-fotografos.mp4");
    expect(VIDEO_DO_TOPO.poster).toBe("/vitrine/video-fotografos-poster.webp");
  });
});
