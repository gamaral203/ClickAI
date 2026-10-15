import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

import type { ModeloMarca } from "@/lib/marca-dagua";

import { LARGURA_ROSTOS, marcaDoVideo, type OpcoesDaMarca } from "./imagens";

// Prévia dos vídeos (docs/arquitetura.md, "Vídeos"), feita aqui mesmo na função da Vercel com o
// FFmpeg (ffmpeg-static): os vídeos são curtos (até 30 s), então a conversão cabe no tempo da
// rota de processamento. Sai um MP4 em até 1280 px no lado maior, com a marca d'água das fotos
// sobre todos os quadros (o mesmo padrão, no modelo do dono do evento), e um quadro do vídeo para
// a miniatura. O original nunca é alterado: o comprador baixa o arquivo que foi enviado.

/** Lado maior da prévia (720p no vídeo deitado, 720×1280 no em pé). */
export const LADO_DA_PREVIA_VIDEO = 1280;
/** Tempo máximo de cada execução do FFmpeg. */
const PRAZO_MS = 4 * 60 * 1000;
/** Corte de segurança da prévia (a duração já é conferida antes). */
const DURACAO_MAXIMA_DA_PREVIA_S = 31;

/** Reduz para caber em LADO_DA_PREVIA_VIDEO (sem aumentar vídeo menor), com medidas pares. */
const ESCALA =
  `scale=w='min(${LADO_DA_PREVIA_VIDEO},iw)':h='min(${LADO_DA_PREVIA_VIDEO},ih)':` +
  "force_original_aspect_ratio=decrease:force_divisible_by=2";

/** Um quadro a cada tantos segundos vai para a busca por selfie. */
export const INTERVALO_DOS_QUADROS_S = 3;
/** Teto de quadros por vídeo (30 s / 3 s): cada um é uma ida ao Rekognition. */
export const MAXIMO_DE_QUADROS = 10;

export class VideoIlegivel extends Error {}

function rodar(args: string[]): Promise<{ codigo: number | null; saida: string }> {
  return new Promise((pronto, falhou) => {
    if (!ffmpegPath) return falhou(new Error("FFmpeg não encontrado neste servidor"));
    const processo = spawn(ffmpegPath, ["-hide_banner", "-nostdin", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let saida = "";
    processo.stderr.on("data", (d: Buffer) => {
      // Só o fim interessa (duração, erros); o começo pode ser enorme.
      saida = (saida + d.toString()).slice(-20_000);
    });
    const prazo = setTimeout(() => processo.kill("SIGKILL"), PRAZO_MS);
    processo.on("error", (e) => {
      clearTimeout(prazo);
      falhou(e);
    });
    processo.on("close", (codigo) => {
      clearTimeout(prazo);
      pronto({ codigo, saida });
    });
  });
}

/** Duração em segundos a partir do que o FFmpeg escreve ("Duration: 00:00:12.34"), ou `null`. */
export function duracaoDaSaida(saida: string): number | null {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(saida);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export type VideoPreparado = {
  duracaoS: number;
  /** Medidas da prévia (já giradas como o vídeo aparece). */
  largura: number;
  altura: number;
  /** Um quadro do vídeo (PNG, sem marca): vira a miniatura e a prévia em imagem. */
  quadro: Buffer;
  /** A prévia em MP4 (H.264 + AAC), com a marca d'água em todos os quadros. */
  previa: Buffer;
  /** Quadros sem marca (JPEG), um a cada INTERVALO_DOS_QUADROS_S, para cadastrar os rostos. */
  quadrosParaRostos: Buffer[];
};

/**
 * Quadros do vídeo para a busca por selfie: um a cada INTERVALO_DOS_QUADROS_S segundos (até
 * MAXIMO_DE_QUADROS), em JPEG de até LARGURA_ROSTOS no lado maior, sem marca d'água (a marca
 * atrapalharia o reconhecimento). Lista vazia se o FFmpeg não tirar nenhum.
 */
async function extrairQuadros(entrada: string, pasta: string): Promise<Buffer[]> {
  const escala =
    `scale=w='min(${LARGURA_ROSTOS},iw)':h='min(${LARGURA_ROSTOS},ih)':` +
    "force_original_aspect_ratio=decrease";
  await rodar([
    "-i",
    entrada,
    "-vf",
    `fps=1/${INTERVALO_DOS_QUADROS_S}:round=up,${escala}`,
    "-frames:v",
    String(MAXIMO_DE_QUADROS),
    "-q:v",
    "3",
    "-y",
    path.join(pasta, "rosto-%02d.jpg"),
  ]);
  const nomes = (await readdir(pasta)).filter((n) => n.startsWith("rosto-")).sort();
  return Promise.all(nomes.map((n) => readFile(path.join(pasta, n))));
}

/** Só os quadros para os rostos, de um vídeo já guardado (o "Cadastrar rostos que faltam"). */
export async function quadrosParaRostos(original: Buffer): Promise<Buffer[]> {
  const pasta = await mkdtemp(path.join(tmpdir(), "video-rostos-"));
  try {
    const entrada = path.join(pasta, "entrada");
    await writeFile(entrada, original);
    return await extrairQuadros(entrada, pasta);
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Lê a duração e, se `aceitar(duracao)` deixar, gera o quadro e a prévia com marca. Lança
 * VideoIlegivel se o FFmpeg não consegue abrir o arquivo. Os arquivos de trabalho ficam numa pasta
 * temporária, apagada no fim.
 */
export async function prepararVideo(
  original: Buffer,
  modelo: ModeloMarca,
  aceitar: (duracaoS: number) => boolean,
  /** Semente e configuração da marca (src/servicos/imagens.ts): o mesmo desenho das fotos. */
  marca: OpcoesDaMarca = { semente: "" },
): Promise<VideoPreparado | { recusado: true; duracaoS: number }> {
  const pasta = await mkdtemp(path.join(tmpdir(), "video-"));
  try {
    const entrada = path.join(pasta, "entrada");
    const quadroPng = path.join(pasta, "quadro.png");
    const marcaPng = path.join(pasta, "marca.png");
    const saida = path.join(pasta, "previa.mp4");
    await writeFile(entrada, original);

    // 1. Um quadro (do segundo 1, ou do começo num vídeo muito curto), na escala da prévia: dá a
    //    duração (na saída do FFmpeg) e as medidas finais, já girado como o celular gravou.
    let r = await rodar([
      "-ss",
      "1",
      "-i",
      entrada,
      "-frames:v",
      "1",
      "-vf",
      ESCALA,
      "-y",
      quadroPng,
    ]);
    let quadro = await readFile(quadroPng).catch(() => null);
    if (!quadro) {
      r = await rodar(["-i", entrada, "-frames:v", "1", "-vf", ESCALA, "-y", quadroPng]);
      quadro = await readFile(quadroPng).catch(() => null);
    }
    const duracaoS = duracaoDaSaida(r.saida);
    if (!quadro || duracaoS === null) throw new VideoIlegivel("FFmpeg não abriu o vídeo");
    if (!aceitar(duracaoS)) return { recusado: true, duracaoS };
    const { width: largura = 0, height: altura = 0 } = await sharp(quadro).metadata();
    if (!largura || !altura) throw new VideoIlegivel("quadro sem medidas");

    // 2. A marca d'água do tamanho exato da prévia, por cima de todos os quadros.
    await writeFile(marcaPng, await marcaDoVideo(largura, altura, modelo, marca));
    const conversao = await rodar([
      "-i",
      entrada,
      "-i",
      marcaPng,
      "-filter_complex",
      `[0:v]${ESCALA}[v];[v][1:v]overlay=0:0,format=yuv420p[s]`,
      "-map",
      "[s]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "27",
      "-profile:v",
      "main",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-t",
      String(DURACAO_MAXIMA_DA_PREVIA_S),
      "-y",
      saida,
    ]);
    const previa = await readFile(saida).catch(() => null);
    if (conversao.codigo !== 0 || !previa || previa.length === 0) {
      throw new VideoIlegivel(`conversão falhou: ${conversao.saida.slice(-300)}`);
    }
    // 3. Os quadros para a busca por selfie (uma falha aqui não impede a venda do vídeo).
    const quadrosParaRostos = await extrairQuadros(entrada, pasta).catch(() => []);
    return { duracaoS, largura, altura, quadro, previa, quadrosParaRostos };
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
