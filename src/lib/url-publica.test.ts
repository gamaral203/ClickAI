import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chavesDaFoto } from "@/servicos/envios";

import { ehPreviaProtegida, IMAGEM_PROCESSANDO, urlDaPrevia, urlPublica } from "./url-publica";

// Garantia contra regressão (docs/CLAUDE.md, "Regras que não podem ser quebradas"): imagem de
// foto só chega ao navegador como prévia protegida (bucket público, `previas/` ou
// `miniaturas/`, gerada no servidor com a marca d'água). Original, upload temporário, link do
// Google Drive ou de qualquer outro domínio viram o aviso "Processando", nunca o arquivo.

const BASE = "https://pub-teste.r2.dev";
const FOTOGRAFO = "11111111-1111-4111-8111-111111111111";
const EVENTO = "22222222-2222-4222-8222-222222222222";
const FOTO = "33333333-3333-4333-8333-333333333333";

/** Formas de entregar um arquivo do Google Drive (ou do Google Fotos) ao navegador. */
const LINKS_DO_DRIVE = [
  `https://drive.google.com/uc?export=view&id=1AbC`,
  `https://drive.google.com/uc?export=download&id=1AbC`,
  `https://drive.google.com/file/d/1AbC/view?usp=sharing`,
  `https://drive.google.com/thumbnail?id=1AbC&sz=w1600`,
  `https://lh3.googleusercontent.com/d/1AbC=w1600`,
  `https://lh3.googleusercontent.com/drive-viewer/AKGp`,
  `https://drive.usercontent.google.com/download?id=1AbC`,
  `https://www.googleapis.com/drive/v3/files/1AbC?alt=media`,
  `https://docs.google.com/uc?id=1AbC`,
];

beforeEach(() => {
  vi.stubEnv("R2_URL_PUBLICA", BASE);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("urlDaPrevia: só prévia protegida chega ao navegador", () => {
  const chaves = chavesDaFoto(FOTOGRAFO, EVENTO, FOTO, "jpeg");

  it("prévia, prévia do celular, miniatura e prévia do vídeo saem do bucket público", () => {
    for (const chave of [
      chaves.previa,
      chaves.previaCelular,
      chaves.miniatura,
      chaves.previaVideo,
    ]) {
      expect(urlDaPrevia(chave)).toBe(`${BASE}/${chave}`);
      expect(ehPreviaProtegida(chave)).toBe(true);
    }
  });

  it("o original e o upload temporário NUNCA viram URL pública", () => {
    for (const chave of [chaves.original, chaves.temporaria]) {
      expect(urlDaPrevia(chave)).toBe(IMAGEM_PROCESSANDO);
      expect(ehPreviaProtegida(chave)).toBe(false);
      // Nem como URL completa no domínio do bucket.
      expect(urlDaPrevia(`${BASE}/${chave}`)).toBe(IMAGEM_PROCESSANDO);
    }
  });

  it("link do Google Drive ou googleusercontent vira o aviso, nas duas funções", () => {
    for (const link of LINKS_DO_DRIVE) {
      expect(urlDaPrevia(link)).toBe(IMAGEM_PROCESSANDO);
      expect(urlPublica(link)).toBe(IMAGEM_PROCESSANDO);
    }
  });

  it("outro domínio, http, data: e truque de caminho viram o aviso", () => {
    for (const valor of [
      "https://img.exemplo/previas/x.webp",
      "http://pub-teste.r2.dev/previas/x.webp",
      `${BASE.replace("https", "http")}/previas/x.webp`,
      "data:image/webp;base64,AAAA",
      "previas/../originais/x.jpg",
      "previas//x.webp",
      "/previas/x.webp",
      "//evil.example/previas/x.webp",
      "originais/x/y/z.jpg",
      "envios/x/y/z.jpg",
      "eventos/x/capa-y.webp",
      "perfis/x/logo.webp",
      "",
    ]) {
      expect(urlDaPrevia(valor), valor).toBe(IMAGEM_PROCESSANDO);
    }
    expect(urlDaPrevia(null)).toBe(IMAGEM_PROCESSANDO);
    expect(urlDaPrevia(undefined)).toBe(IMAGEM_PROCESSANDO);
  });

  it("foto que ainda não está pronta mostra o aviso, nunca o arquivo (falha segura)", () => {
    expect(urlDaPrevia(chaves.previa, { pronta: false })).toBe(IMAGEM_PROCESSANDO);
    expect(urlDaPrevia(chaves.original, { pronta: false })).toBe(IMAGEM_PROCESSANDO);
  });

  it("URL completa do próprio bucket, já gravada assim, continua valendo", () => {
    expect(urlDaPrevia(`${BASE}/${chaves.previa}`)).toBe(`${BASE}/${chaves.previa}`);
  });

  it("prévias de exemplo (public/exemplo, já com marca) passam como estão", () => {
    expect(urlDaPrevia("/exemplo/previas/3.webp")).toBe("/exemplo/previas/3.webp");
    expect(urlDaPrevia("/exemplo/miniaturas/3.webp")).toBe("/exemplo/miniaturas/3.webp");
    expect(urlDaPrevia("/exemplo/originais/3.jpg")).toBe(IMAGEM_PROCESSANDO);
  });

  it("sem R2_URL_PUBLICA, URL completa não é aceita como prévia", () => {
    vi.stubEnv("R2_URL_PUBLICA", "");
    expect(urlDaPrevia(`${BASE}/${chaves.previa}`)).toBe(IMAGEM_PROCESSANDO);
    expect(urlDaPrevia(chaves.previa)).toBe(`/${chaves.previa}`);
  });
});

describe("urlPublica (divulgação: logo, banner e capa enviada)", () => {
  it("monta a URL das chaves e aceita só URLs completas do R2", () => {
    expect(urlPublica("perfis/x/logo.webp")).toBe(`${BASE}/perfis/x/logo.webp`);
    expect(urlPublica("https://outro.r2.dev/perfis/x/logo.webp")).toBe(
      "https://outro.r2.dev/perfis/x/logo.webp",
    );
    expect(urlPublica("/logo.png")).toBe("/logo.png");
    expect(urlPublica("https://img.exemplo/logo.webp")).toBe(IMAGEM_PROCESSANDO);
    expect(urlPublica("//evil.example/logo.webp")).toBe(IMAGEM_PROCESSANDO);
    expect(urlPublica("previas/../originais/x.jpg")).toBe(IMAGEM_PROCESSANDO);
  });

  it("a capa enviada pelo dono sai como foi enviada (chave do R2, URL do R2 ou data:)", () => {
    // Capa, banner e logo são divulgação, fora da regra das prévias protegidas (docs/CLAUDE.md).
    const capa = `eventos/${EVENTO}/capa-${FOTO}.webp`;
    expect(urlPublica(capa)).toBe(`${BASE}/${capa}`);
    expect(urlPublica(`${BASE}/${capa}`)).toBe(`${BASE}/${capa}`);
    expect(urlPublica("data:image/webp;base64,AAAA")).toBe("data:image/webp;base64,AAAA");
    // Mas a capa nunca serve de prévia de foto à venda.
    expect(urlDaPrevia(capa)).toBe(IMAGEM_PROCESSANDO);
  });
});
