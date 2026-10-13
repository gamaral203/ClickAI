import "server-only";

import { concluirFoto, marcarFotoComErro, modeloMarcaDoEvento, videosNoStream } from "@/dados";
import { emParalelo } from "@/lib/concorrencia";
import { gravarPublico, removerOriginal } from "@/lib/r2";
import { removerDoStream, situacaoNoStream, streamConfigurado, urlDoQuadro } from "@/lib/stream";
import { DURACAO_MAXIMA_VIDEO_S, FOLGA_DURACAO_S, MENSAGEM_VIDEO_LONGO } from "@/lib/tipos-video";

import { gerarVersoes } from "./imagens";

// Vídeos depois de entregues ao Cloudflare Stream (src/lib/stream.ts): enquanto o Stream prepara a
// prévia com marca d'água, o vídeo fica em `processando`. Quando ela fica pronta, aqui se confere a
// duração (até 30 segundos), se gera a miniatura e a prévia em imagem (um quadro do vídeo, com a
// nossa marca d'água, para a galeria, o carrinho e os cartões) e o vídeo fica `pronta`.
//
// Quem chama: o job de revisão (todos os vídeos) e a página do evento no painel (os do evento, a
// cada atualização automática da grade), para o vídeo aparecer pronto logo que o Stream termina.

/** Depois disto esperando o Stream, o vídeo vira erro (o Stream costuma levar menos de 1 minuto). */
const ESPERA_MAXIMA_MS = 45 * 60 * 1000;
const ERRO_STREAM = "Não foi possível preparar o vídeo. Envie de novo.";

type VideoNoStream = Awaited<ReturnType<typeof videosNoStream>>[number];

export type ResultadoVideo = "pronto" | "processando" | "erro";

async function falhar(video: VideoNoStream, mensagem: string) {
  await marcarFotoComErro(video.id, mensagem);
  if (video.streamUid) await removerDoStream(video.streamUid);
  // O original recusado não fica guardado (ninguém vai comprá-lo).
  if (video.chaveOriginal?.startsWith("originais/")) {
    await removerOriginal(video.chaveOriginal).catch(() => {});
  }
}

/** Confere um vídeo no Stream e, se a prévia ficou pronta, termina o item. */
export async function finalizarVideo(
  video: VideoNoStream,
  agora = Date.now(),
): Promise<ResultadoVideo> {
  if (!video.streamUid || !video.chaveOriginal) return "processando";
  const situacao = await situacaoNoStream(video.streamUid);
  if (situacao.estado === "processando") {
    if (agora - new Date(video.inicio).getTime() > ESPERA_MAXIMA_MS) {
      await falhar(video, ERRO_STREAM);
      return "erro";
    }
    return "processando";
  }
  if (situacao.estado === "erro") {
    console.error(`[videos] o Stream recusou o vídeo ${video.id}: ${situacao.motivo}`);
    await falhar(video, ERRO_STREAM);
    return "erro";
  }
  if (situacao.duracaoS > DURACAO_MAXIMA_VIDEO_S + FOLGA_DURACAO_S) {
    await falhar(video, MENSAGEM_VIDEO_LONGO);
    return "erro";
  }

  // Um quadro do vídeo vira a miniatura e a prévia em imagem, com a nossa marca d'água.
  const resposta = await fetch(urlDoQuadro(video.streamUid), {
    signal: AbortSignal.timeout(20_000),
  });
  if (!resposta.ok) return "processando";
  const quadro = Buffer.from(await resposta.arrayBuffer());
  const { previa, miniatura } = await gerarVersoes(
    quadro,
    await modeloMarcaDoEvento(video.eventoId),
  );
  await Promise.all([
    gravarPublico(video.urlPrevia, previa.buffer, "image/webp"),
    gravarPublico(video.urlMiniatura, miniatura.buffer, "image/webp"),
  ]);
  await concluirFoto(video.id, {
    chaveOriginal: video.chaveOriginal,
    largura: situacao.largura || previa.largura,
    altura: situacao.altura || previa.altura,
    capturadaEm: null,
    duracaoS: Math.max(1, Math.round(situacao.duracaoS)),
  });
  return "pronto";
}

/** Confere os vídeos esperando o Stream (de um evento, ou de todos). Nunca lança. */
export async function atualizarVideosNoStream(
  eventoId: string | null = null,
  limite = 30,
): Promise<{ prontos: number; comErro: number }> {
  const resultado = { prontos: 0, comErro: 0 };
  if (!streamConfigurado()) return resultado;
  try {
    const videos = await videosNoStream(eventoId, limite);
    await emParalelo(videos, 4, async (video) => {
      try {
        const r = await finalizarVideo(video);
        if (r === "pronto") resultado.prontos++;
        if (r === "erro") resultado.comErro++;
      } catch (erro) {
        console.error(`[videos] falha ao conferir o vídeo ${video.id}`, erro);
      }
    });
  } catch (erro) {
    console.error("[videos] falha ao listar os vídeos no Stream", erro);
  }
  return resultado;
}
