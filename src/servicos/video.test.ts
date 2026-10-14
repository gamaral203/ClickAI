import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { duracaoDaSaida, prepararVideo, quadrosParaRostos, VideoIlegivel } from "./video";

// Prévia dos vídeos com o FFmpeg: o vídeo de teste é gerado pelo próprio FFmpeg (barras de cor
// com som), para conferir a duração, as medidas, a marca e o MP4 de saída.

function videoDeTeste(segundos: number, largura: number, altura: number) {
  const pasta = mkdtempSync(path.join(tmpdir(), "video-teste-"));
  const arquivo = path.join(pasta, "teste.mp4");
  const r = spawnSync(ffmpegPath!, [
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=${largura}x${altura}:rate=15:duration=${segundos}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${segundos}`,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    arquivo,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const conteudo = readFileSync(arquivo);
  rmSync(pasta, { recursive: true, force: true });
  return conteudo;
}

describe("prévia do vídeo com o FFmpeg", () => {
  it("lê a duração da saída do FFmpeg", () => {
    expect(duracaoDaSaida("  Duration: 00:00:12.34, start: 0.000000")).toBeCloseTo(12.34);
    expect(duracaoDaSaida("  Duration: 00:01:02.50, start")).toBeCloseTo(62.5);
    expect(duracaoDaSaida("sem nada")).toBeNull();
  });

  it("gera o MP4 com a marca e o quadro, reduzindo para 1280 no lado maior", async () => {
    const original = videoDeTeste(3, 1920, 1080);
    const r = await prepararVideo(original, "padrao", (d) => d <= 30.5);
    if ("recusado" in r) throw new Error("recusou");
    expect(r.duracaoS).toBeGreaterThan(2.5);
    expect(r.duracaoS).toBeLessThan(3.5);
    expect([r.largura, r.altura]).toEqual([1280, 720]);
    expect((await sharp(r.quadro).metadata()).width).toBe(1280);
    // MP4 de verdade: a caixa ftyp no começo e o moov na frente (faststart, toca antes de baixar).
    expect(r.previa.subarray(4, 8).toString()).toBe("ftyp");
    expect(r.previa.indexOf("moov")).toBeLessThan(r.previa.indexOf("mdat"));
    // Um quadro a cada 3 s para a busca por selfie, sem marca e no tamanho do reconhecimento.
    expect(r.quadrosParaRostos).toHaveLength(1);
    expect((await sharp(r.quadrosParaRostos[0]).metadata()).format).toBe("jpeg");
    expect((await sharp(r.quadrosParaRostos[0]).metadata()).width).toBe(1920);
  }, 120_000);

  it("tira um quadro a cada 3 segundos para os rostos, até 10", async () => {
    expect(await quadrosParaRostos(videoDeTeste(7, 320, 240))).toHaveLength(3);
    expect(await quadrosParaRostos(videoDeTeste(40, 160, 120))).toHaveLength(10);
    expect(await quadrosParaRostos(Buffer.from("isto não é um vídeo"))).toEqual([]);
  }, 120_000);

  it("não aumenta vídeo pequeno e recusa o longo sem converter", async () => {
    const pequeno = await prepararVideo(videoDeTeste(2, 640, 360), "padrao", () => true);
    if ("recusado" in pequeno) throw new Error("recusou");
    expect([pequeno.largura, pequeno.altura]).toEqual([640, 360]);

    const longo = await prepararVideo(videoDeTeste(2, 320, 240), "padrao", () => false);
    expect(longo).toMatchObject({ recusado: true });
  }, 120_000);

  it("arquivo que não é vídeo lança VideoIlegivel", async () => {
    await expect(
      prepararVideo(Buffer.from("isto não é um vídeo"), "padrao", () => true),
    ).rejects.toBeInstanceOf(VideoIlegivel);
  }, 60_000);
});
