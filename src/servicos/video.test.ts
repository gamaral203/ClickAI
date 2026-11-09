import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  duracaoDaSaida,
  FalhaNoVideo,
  prepararVideo,
  quadrosParaRostos,
  semUrls,
  VideoIlegivel,
  VideoPesado,
} from "./video";

// Servidor HTTP local com Range, no papel do R2: o FFmpeg lê o vídeo pela URL, como em produção.
const arquivos = new Map<string, Buffer>();
let servidor: Server;
let base = "";
let pedidos = 0;
beforeAll(async () => {
  servidor = createServer((req, res) => {
    const corpo = arquivos.get((req.url ?? "").split("?")[0]);
    if (!corpo) {
      res.statusCode = 404;
      return res.end();
    }
    pedidos++;
    const faixa = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const inicio = faixa ? Number(faixa[1]) : 0;
    const fim = faixa && faixa[2] ? Number(faixa[2]) : corpo.length - 1;
    res.writeHead(faixa ? 206 : 200, {
      "Content-Length": fim - inicio + 1,
      "Accept-Ranges": "bytes",
      ...(faixa ? { "Content-Range": `bytes ${inicio}-${fim}/${corpo.length}` } : {}),
    });
    res.end(corpo.subarray(inicio, fim + 1));
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => {
  servidor.close();
});

/** Publica o vídeo no servidor local e devolve a URL (com uma "assinatura" na consulta). */
function publicar(nome: string, corpo: Buffer) {
  arquivos.set(`/${nome}`, corpo);
  return `${base}/${nome}?X-Amz-Signature=segredo`;
}

// Prévia dos vídeos com o FFmpeg: o vídeo de teste é gerado pelo próprio FFmpeg (barras de cor
// com som), para conferir a duração, as medidas, a marca e o MP4 de saída.

function videoDeTeste(segundos: number, largura: number, altura: number, extras: string[] = []) {
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
    ...extras,
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

  it("a prévia pública não leva GPS nem outros metadados do arquivo enviado", async () => {
    const original = videoDeTeste(2, 320, 240, [
      "-metadata",
      "location=+37.7749-122.4194/",
      "-metadata",
      "title=Aparelho do cliente",
      "-movflags",
      "use_metadata_tags",
    ]);
    expect(original.includes(Buffer.from("+37.7749"))).toBe(true);
    const r = await prepararVideo(original, "padrao", (d) => d <= 30.5);
    if ("recusado" in r) throw new Error("recusou");
    expect(r.previa.includes(Buffer.from("+37.7749"))).toBe(false);
    expect(r.previa.includes(Buffer.from("Aparelho do cliente"))).toBe(false);
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

  it("lê por URL (como a assinada do R2), aos poucos, e nenhuma URL fica na saída", async () => {
    const original = videoDeTeste(3, 640, 360);
    const antes = pedidos;
    const r = await prepararVideo(publicar("url.mp4", original), "padrao", (d) => d <= 30.5);
    if ("recusado" in r) throw new Error("recusou");
    expect([r.largura, r.altura]).toEqual([640, 360]);
    expect(r.quadrosParaRostos).toHaveLength(1);
    expect(r.trechosDanificados).toBe(0);
    expect(pedidos).toBeGreaterThan(antes);
    expect(semUrls("from 'https://conta.r2.cloudflarestorage.com/x?X-Amz-Signature=abc': ok")).toBe(
      "from '<url>': ok",
    );
  }, 120_000);

  it("4K em pé (2160x3840) sai em 720x1280, com os quadros dos rostos em 1080x1920", async () => {
    const original = videoDeTeste(2, 2160, 3840);
    const r = await prepararVideo(publicar("4k.mp4", original), "padrao", (d) => d <= 30.5);
    if ("recusado" in r) throw new Error("recusou");
    expect([r.largura, r.altura]).toEqual([720, 1280]);
    expect((await sharp(r.quadro).metadata()).height).toBe(1280);
    const rosto = await sharp(r.quadrosParaRostos[0]).metadata();
    expect([rosto.width, rosto.height]).toEqual([1080, 1920]);
    expect(r.previa.indexOf("moov")).toBeLessThan(r.previa.indexOf("mdat"));
  }, 120_000);

  it("conversão que passa do prazo lança VideoPesado (e não VideoIlegivel)", async () => {
    const original = videoDeTeste(6, 2160, 3840, ["-r", "30"]);
    await expect(
      prepararVideo(publicar("pesado.mp4", original), "padrao", () => true, { prazoMs: 1000 }),
    ).rejects.toBeInstanceOf(VideoPesado);
  }, 120_000);

  it("URL que não responde é falha passageira (o vídeo volta para a fila, nada é apagado)", async () => {
    await expect(
      prepararVideo(`${base}/nao-existe.mp4?X-Amz-Signature=segredo`, "padrao", () => true),
    ).rejects.toBeInstanceOf(FalhaNoVideo);
    await expect(quadrosParaRostos(`${base}/nao-existe.mp4`)).rejects.toBeInstanceOf(FalhaNoVideo);
    // A mensagem do erro (que vai para o log) não leva a URL assinada.
    const erro = await prepararVideo(
      `${base}/nao-existe.mp4?X-Amz-Signature=segredo`,
      "padrao",
      () => true,
    ).catch((e: Error) => e);
    expect(String((erro as Error).message)).not.toContain("segredo");
  }, 60_000);

  it("vídeo com trechos danificados é aceito e conta os trechos (só para avisar)", async () => {
    const bom = videoDeTeste(4, 640, 360, ["-g", "300", "-movflags", "+faststart"]);
    const danificado = Buffer.from(bom);
    // Lixo no meio dos dados (o índice fica no começo, intacto): o FFmpeg decodifica com defeitos.
    for (let i = Math.floor(danificado.length * 0.4); i < danificado.length * 0.45; i += 7) {
      danificado[i] = 0xff;
    }
    const r = await prepararVideo(publicar("danificado.mp4", danificado), "padrao", () => true);
    if ("recusado" in r) throw new Error("recusou");
    expect(r.trechosDanificados).toBeGreaterThan(0);
    expect(r.previa.length).toBeGreaterThan(0);
  }, 120_000);
});
