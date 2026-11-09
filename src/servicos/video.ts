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
//
// Vídeo 4K (medido em 09/11/2026, docs/arquitetura.md): o FFmpeg lê o original direto do R2 por
// uma URL assinada, aos poucos, sem o arquivo inteiro na memória da função nem no /tmp (o /tmp da
// instância é pequeno e dividido entre as chamadas: 4K de 80 a 120 MB davam ENOSPC). A conversão e
// os quadros para os rostos saem de uma decodificação só, com poucos threads (o FFmpeg abre um
// por núcleo que enxerga, e cada um segura quadros 4K de 12 MB), e com prazo próprio.

/** Lado maior da prévia (720p no vídeo deitado, 720×1280 no em pé). */
export const LADO_DA_PREVIA_VIDEO = 1280;
/** Prazo padrão da conversão (quem chama passa o que sobra do tempo da função). */
export const PRAZO_DA_CONVERSAO_MS = 200 * 1000;
/** Prazo das execuções curtas (um quadro, ou a leitura do cabeçalho). */
const PRAZO_CURTO_MS = 60 * 1000;
/** Corte de segurança da prévia (a duração já é conferida antes). */
const DURACAO_MAXIMA_DA_PREVIA_S = 31;
/**
 * Threads de cada FFmpeg (na decodificação e no x264). Sem isto, ele abre um por núcleo que a
 * máquina mostra: num 4K, 16 threads chegaram a 830 MB de memória num FFmpeg só (2 threads: ~310 MB),
 * sem ganho de tempo na função de 1 vCPU.
 */
export const THREADS_DO_FFMPEG = 2;

/** Reduz para caber em LADO_DA_PREVIA_VIDEO (sem aumentar vídeo menor), com medidas pares. */
const ESCALA =
  `scale=w='min(${LADO_DA_PREVIA_VIDEO},iw)':h='min(${LADO_DA_PREVIA_VIDEO},ih)':` +
  "force_original_aspect_ratio=decrease:force_divisible_by=2";
const ESCALA_DOS_ROSTOS =
  `scale=w='min(${LARGURA_ROSTOS},iw)':h='min(${LARGURA_ROSTOS},ih)':` +
  "force_original_aspect_ratio=decrease";

/** Um quadro a cada tantos segundos vai para a busca por selfie. */
export const INTERVALO_DOS_QUADROS_S = 3;
/** Teto de quadros por vídeo (30 s / 3 s): cada um é uma ida ao Rekognition. */
export const MAXIMO_DE_QUADROS = 10;

/** O arquivo não é um vídeo que o FFmpeg abra (recusa definitiva: o fotógrafo exporta de novo). */
export class VideoIlegivel extends Error {}
/** A conversão passou do prazo: vídeo pesado demais para a função (ou a instância lotada). */
export class VideoPesado extends Error {}
/** Falha passageira (rede até o R2, memória ou disco da instância): vale tentar de novo. */
export class FalhaNoVideo extends Error {}

/**
 * De onde o FFmpeg lê o vídeo: o conteúdo (Buffer, gravado num arquivo temporário), ou uma URL
 * (a assinada do R2) ou o caminho de um arquivo, lidos aos poucos pelo próprio FFmpeg.
 */
export type EntradaDoVideo = Buffer | string;

/** Trechos danificados que o FFmpeg relata ao decodificar (o arquivo abre, mas com defeitos). */
const TRECHO_DANIFICADO =
  /error while decoding|concealing \d+|corrupt decoded frame|missing reference|decode_slice_header error|Invalid NAL unit/i;

/** Saída do FFmpeg sem nenhuma URL (a assinada do R2 não vai para log nem para mensagem). */
export function semUrls(texto: string) {
  return texto.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, "<url>");
}

type Execucao = {
  codigo: number | null;
  /** Saída (o fim, sem URLs). */
  saida: string;
  /** Morto pelo prazo desta execução. */
  estourou: boolean;
  /** Morto por sinal de fora (falta de memória na instância, por exemplo). */
  sinal: NodeJS.Signals | null;
  /** Linhas com trecho danificado na decodificação. */
  danificados: number;
};

function rodar(args: string[], prazoMs: number): Promise<Execucao> {
  return new Promise((pronto, falhou) => {
    if (!ffmpegPath) return falhou(new Error("FFmpeg não encontrado neste servidor"));
    const processo = spawn(ffmpegPath, ["-hide_banner", "-nostdin", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let saida = "";
    let resto = "";
    let danificados = 0;
    let estourou = false;
    processo.stderr.on("data", (d: Buffer) => {
      const texto = d.toString();
      // Conta os trechos danificados linha a linha (a saída inteira não fica guardada).
      const linhas = (resto + texto).split(/\r?\n|\r/);
      resto = linhas.pop() ?? "";
      for (const linha of linhas) if (TRECHO_DANIFICADO.test(linha)) danificados++;
      // Só o fim interessa (duração, erros); o começo pode ser enorme.
      saida = (saida + texto).slice(-20_000);
    });
    const prazo = setTimeout(
      () => {
        estourou = true;
        processo.kill("SIGKILL");
      },
      Math.max(1000, prazoMs),
    );
    processo.on("error", (e) => {
      clearTimeout(prazo);
      // O erro do spawn traz os argumentos (`spawnargs`, com a URL assinada): sai um erro novo, só
      // com a mensagem sem URLs.
      falhou(new FalhaNoVideo(`FFmpeg não iniciou: ${semUrls(e.message)}`));
    });
    processo.on("close", (codigo, sinal) => {
      clearTimeout(prazo);
      if (TRECHO_DANIFICADO.test(resto)) danificados++;
      pronto({
        codigo,
        saida: semUrls(saida),
        estourou,
        sinal: estourou ? null : sinal,
        danificados,
      });
    });
  });
}

/** Opções de leitura antes do `-i`: threads e só os protocolos de que a entrada precisa. */
function lerDe(entrada: string, antes: string[] = []): string[] {
  const remota = /^https?:\/\//i.test(entrada);
  return [
    "-threads",
    String(THREADS_DO_FFMPEG),
    // Um MP4 pode apontar para outros arquivos ou endereços: só o protocolo da entrada vale.
    "-protocol_whitelist",
    remota ? "http,https,tls,tcp" : "file",
    ...(remota
      ? [
          // Uma queda na conexão com o R2 retoma do ponto em que parou, em vez de falhar a prévia.
          "-reconnect",
          "1",
          "-reconnect_on_network_error",
          "1",
          "-reconnect_delay_max",
          "5",
          // Sem resposta por 30 s, desiste (em microssegundos).
          "-rw_timeout",
          "30000000",
        ]
      : []),
    ...antes,
    "-i",
    entrada,
  ];
}

/**
 * Saída que indica problema de leitura passageiro (rede, memória, disco), e não um arquivo
 * ruim: nesse caso o vídeo volta para a fila, sem apagar nada.
 */
const FALHA_PASSAGEIRA =
  /HTTP error|Server returned|Connection (refused|reset|timed out)|Input\/output error|I\/O error|timed out|Failed to resolve|Network is unreachable|No space left|Cannot allocate memory|Resource temporarily unavailable|Error in the pull function|tls|Will reconnect/i;

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
  /**
   * Trechos danificados que o FFmpeg relatou na conversão (0 no arquivo íntegro). O vídeo é
   * aceito do mesmo jeito; serve só para avisar o fotógrafo.
   */
  trechosDanificados: number;
};

/** Pasta de trabalho e a entrada como o FFmpeg a lê (o Buffer vira um arquivo nela). */
async function prepararEntrada(entrada: EntradaDoVideo, prefixo: string) {
  const pasta = await mkdtemp(path.join(tmpdir(), prefixo));
  if (typeof entrada === "string") return { pasta, origem: entrada };
  const origem = path.join(pasta, "entrada");
  await writeFile(origem, entrada);
  return { pasta, origem };
}

/** Os JPEG dos rostos que o FFmpeg gravou na pasta, na ordem. */
async function lerQuadros(pasta: string): Promise<Buffer[]> {
  const nomes = (await readdir(pasta)).filter((n) => n.startsWith("rosto-")).sort();
  return Promise.all(nomes.map((n) => readFile(path.join(pasta, n))));
}

/** Filtro dos quadros para os rostos: um a cada INTERVALO_DOS_QUADROS_S, sem marca d'água. */
const FILTRO_DOS_ROSTOS = `fps=1/${INTERVALO_DOS_QUADROS_S}:round=up,${ESCALA_DOS_ROSTOS}`;
/** Saída dos quadros para os rostos (até MAXIMO_DE_QUADROS, JPEG). */
function saidaDosRostos(pasta: string) {
  return [
    "-frames:v",
    String(MAXIMO_DE_QUADROS),
    "-q:v",
    "3",
    "-y",
    path.join(pasta, "rosto-%02d.jpg"),
  ];
}

/**
 * Só os quadros para os rostos, de um vídeo já guardado (o "Cadastrar rostos que faltam"): um a
 * cada INTERVALO_DOS_QUADROS_S segundos (até MAXIMO_DE_QUADROS), em JPEG de até LARGURA_ROSTOS no
 * lado maior, sem marca d'água (a marca atrapalharia o reconhecimento). Lista vazia se o FFmpeg
 * não tirar nenhum.
 */
export async function quadrosParaRostos(
  entrada: EntradaDoVideo,
  prazoMs = PRAZO_DA_CONVERSAO_MS,
): Promise<Buffer[]> {
  const { pasta, origem } = await prepararEntrada(entrada, "video-rostos-");
  try {
    const r = await rodar(
      [...lerDe(origem), "-vf", FILTRO_DOS_ROSTOS, ...saidaDosRostos(pasta)],
      prazoMs,
    );
    const quadros = await lerQuadros(pasta);
    // Sem quadro por falha passageira (rede, memória, prazo): quem chama tenta de novo depois,
    // em vez de dar o vídeo como cadastrado sem rosto nenhum.
    if (quadros.length === 0 && (r.estourou || r.sinal || FALHA_PASSAGEIRA.test(r.saida))) {
      throw new FalhaNoVideo(`quadros falharam: ${r.saida.slice(-300)}`);
    }
    return quadros;
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

export type OpcoesDoVideo = {
  /** Semente e configuração da marca (src/servicos/imagens.ts): o mesmo desenho das fotos. */
  marca?: OpcoesDaMarca;
  /** Até quanto tempo a conversão pode levar (o que sobra do tempo da função). */
  prazoMs?: number;
};

/**
 * Lê a duração e, se `aceitar(duracao)` deixar, gera o quadro, a prévia com marca e os quadros
 * para os rostos. Lança VideoIlegivel se o FFmpeg não consegue abrir o arquivo, VideoPesado se a
 * conversão passa do prazo e FalhaNoVideo numa falha passageira. Os arquivos de trabalho (só as
 * saídas, pequenas, quando a entrada é uma URL) ficam numa pasta temporária, apagada no fim.
 */
export async function prepararVideo(
  entrada: EntradaDoVideo,
  modelo: ModeloMarca,
  aceitar: (duracaoS: number) => boolean,
  { marca = { semente: "" }, prazoMs = PRAZO_DA_CONVERSAO_MS }: OpcoesDoVideo = {},
): Promise<VideoPreparado | { recusado: true; duracaoS: number }> {
  const { pasta, origem } = await prepararEntrada(entrada, "video-");
  try {
    const quadroPng = path.join(pasta, "quadro.png");
    const marcaPng = path.join(pasta, "marca.png");
    const saida = path.join(pasta, "previa.mp4");

    // 1. Um quadro (do segundo 1, ou do começo num vídeo muito curto), na escala da prévia: dá a
    //    duração (na saída do FFmpeg) e as medidas finais, já girado como o celular gravou. Com a
    //    busca pelo segundo 1, o FFmpeg lê só o índice e um trecho do arquivo.
    const umQuadro = (antes: string[]) =>
      rodar(
        [...lerDe(origem, antes), "-frames:v", "1", "-vf", ESCALA, "-y", quadroPng],
        PRAZO_CURTO_MS,
      );
    let r = await umQuadro(["-ss", "1"]);
    let quadro = await readFile(quadroPng).catch(() => null);
    if (!quadro) {
      r = await umQuadro([]);
      quadro = await readFile(quadroPng).catch(() => null);
    }
    const duracaoS = duracaoDaSaida(r.saida);
    if (!quadro || duracaoS === null) {
      // Sem o quadro por causa da rede, da memória ou do prazo, o arquivo pode estar bom.
      if (r.estourou || r.sinal || FALHA_PASSAGEIRA.test(r.saida)) {
        throw new FalhaNoVideo(`leitura falhou: ${r.saida.slice(-300)}`);
      }
      throw new VideoIlegivel("FFmpeg não abriu o vídeo");
    }
    if (!aceitar(duracaoS)) return { recusado: true, duracaoS };
    const { width: largura = 0, height: altura = 0 } = await sharp(quadro).metadata();
    if (!largura || !altura) throw new VideoIlegivel("quadro sem medidas");

    // 2. A marca d'água do tamanho exato da prévia, por cima de todos os quadros. Na mesma
    //    decodificação, os quadros para os rostos (sem marca), em vez de ler o vídeo de novo.
    await writeFile(marcaPng, await marcaDoVideo(largura, altura, modelo, marca));
    const conversao = await rodar(
      [
        ...lerDe(origem),
        "-i",
        marcaPng,
        "-filter_threads",
        "1",
        "-filter_complex",
        `[0:v]split=2[a][b];[a]${ESCALA}[v];[v][1:v]overlay=0:0,format=yuv420p[s];` +
          `[b]${FILTRO_DOS_ROSTOS}[r]`,
        "-map",
        "[s]",
        "-map",
        "0:a?",
        // Nada dos metadados do arquivo enviado vai para a prévia pública: o MOV do iPhone traz o
        // GPS (location) e o modelo do aparelho, que o FFmpeg copiaria sem estas opções.
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-c:v",
        "libx264",
        "-threads",
        String(THREADS_DO_FFMPEG),
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
        // 3. Os quadros para a busca por selfie (sem eles, o vídeo é vendido do mesmo jeito).
        "-map",
        "[r]",
        "-map_metadata",
        "-1",
        ...saidaDosRostos(pasta),
      ],
      prazoMs,
    );
    if (conversao.estourou) {
      throw new VideoPesado(`conversão passou de ${Math.round(prazoMs / 1000)} s`);
    }
    const previa = await readFile(saida).catch(() => null);
    if (conversao.codigo !== 0 || !previa || previa.length === 0) {
      // O arquivo já abriu no passo 1: aqui a falha é da instância (memória, disco, rede).
      throw new FalhaNoVideo(
        `conversão falhou (${conversao.sinal ?? conversao.codigo}): ${conversao.saida.slice(-300)}`,
      );
    }
    const quadrosParaRostos = await lerQuadros(pasta).catch(() => []);
    return {
      duracaoS,
      largura,
      altura,
      quadro,
      previa,
      quadrosParaRostos,
      trechosDanificados: conversao.danificados,
    };
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
