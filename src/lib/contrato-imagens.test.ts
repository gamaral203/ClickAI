import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Contrato das imagens públicas (docs/CLAUDE.md, "Regras que não podem ser quebradas"), conferido
// no código-fonte: toda imagem de foto que vai ao navegador passa por `urlDaPrevia`
// (src/lib/url-publica.ts), que só aceita prévia protegida. Se este teste falhar, a mudança
// abriu um caminho para o original ou para um arquivo de fora do bucket de prévias: corrija o
// código, não o teste (e, se a mudança for mesmo necessária, revise com docs/seguranca.md).

const RAIZ = path.resolve(__dirname, "..", "..");
const SRC = path.join(RAIZ, "src");

function arquivosDoCodigo(pasta = SRC): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) return arquivosDoCodigo(caminho);
    if (!/\.(ts|tsx)$/.test(entrada.name) || /\.test\.tsx?$/.test(entrada.name)) return [];
    return [caminho];
  });
}

const relativo = (arquivo: string) => path.relative(RAIZ, arquivo).replaceAll("\\", "/");
const codigo = arquivosDoCodigo().map((arquivo) => ({
  arquivo: relativo(arquivo),
  texto: readFileSync(arquivo, "utf8"),
}));

function ocorrencias(padrao: RegExp, exceto: string[] = []) {
  return codigo
    .filter(({ arquivo }) => !exceto.includes(arquivo))
    .flatMap(({ arquivo, texto }) =>
      texto
        .split("\n")
        .map((linha, i) => ({ linha, i }))
        .filter(({ linha }) => padrao.test(linha))
        .map(({ linha, i }) => `${arquivo}:${i + 1}: ${linha.trim()}`),
    );
}

describe("contrato das imagens públicas", () => {
  it("o código não monta link do Google Drive nem do googleusercontent", () => {
    expect(
      ocorrencias(
        /drive\.google|googleusercontent|drive\.usercontent|googleapis\.com\/drive|webContentLink|thumbnailLink|webViewLink/i,
        ["src/lib/url-publica.ts"],
      ),
    ).toEqual([]);
  });

  it("imagem de foto nunca passa por urlPublica (só por urlDaPrevia)", () => {
    expect(
      ocorrencias(/urlPublica\([^)]*(urlPrevia|urlMiniatura|previaVideo|previa\b|miniatura\b)/),
    ).toEqual([]);
  });

  it("nenhuma URL pública é montada a partir da chave do original", () => {
    expect(
      ocorrencias(
        /(urlPublica|urlDaPrevia|gravarPublico)\([^)]*(chaveOriginal|original\b|temporaria)/i,
      ),
    ).toEqual([]);
  });

  it("só src/lib/url-publica.ts monta endereço com R2_URL_PUBLICA", () => {
    expect(
      ocorrencias(/process\.env\.R2_URL_PUBLICA/, ["src/lib/url-publica.ts", "src/lib/r2.ts"]),
    ).toEqual([]);
  });

  it("páginas e componentes não recebem a chave do original", () => {
    expect(
      ocorrencias(/chaveOriginal|chave_original/).filter(
        (o) => o.startsWith("src/app/") || o.startsWith("src/components/"),
      ),
    ).toEqual([]);
  });

  it("só o servidor de prévias grava no bucket público (lista fechada, revisar ao mudar)", () => {
    // Cada um destes grava só o que saiu de src/servicos/imagens.ts com a marca (prévias,
    // miniaturas, prévia do vídeo) ou uma imagem de divulgação, fora da regra das prévias
    // (capa e moldura enviadas pelo dono do evento, logo e banner da loja), numa chave fora de
    // previas/ e miniaturas/.
    const permitidos = [
      "src/app/(fotografo)/painel/eventos/capa-acoes.ts",
      "src/app/(fotografo)/painel/loja/acoes.ts",
      "src/lib/r2.ts",
      "src/servicos/envios.ts",
      "src/servicos/molduras.ts",
      "src/servicos/regerar-previas.ts",
    ];
    const quemGrava = codigo
      .filter(({ texto }) => /\bgravarPublico\b/.test(texto))
      .map(({ arquivo }) => arquivo);
    expect(quemGrava.filter((a) => !permitidos.includes(a))).toEqual([]);
  });

  it("next.config e a CSP não liberam domínio do Google Drive para imagens", () => {
    const config = readFileSync(path.join(RAIZ, "next.config.ts"), "utf8");
    expect(config).not.toMatch(/google/i);
    const csp = readFileSync(path.join(SRC, "lib", "csp.ts"), "utf8");
    expect(csp).not.toMatch(/drive\.google|googleusercontent|drive\.usercontent/i);
  });
});
