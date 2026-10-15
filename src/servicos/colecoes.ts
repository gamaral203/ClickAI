import "server-only";

import {
  colecoesInativas,
  concluirReindexacao,
  fotosParaIndexar,
  marcarColecaoArquivada,
  reindexacoesPedidas,
  reservarReindexacao,
  soltarReindexacao,
} from "@/dados";
import { emParalelo } from "@/lib/concorrencia";
import { lerOriginal, r2Configurado } from "@/lib/r2";
import {
  apagarColecao,
  ehErroDeCredencial,
  nomeDoErro,
  provedorFacial,
} from "@/lib/reconhecimento";

import { indexarRostosDaFoto, indexarRostosDoVideo, type IndexacaoDeRostos } from "./envios";
import { quadrosParaRostos } from "./video";

// Coleções de rostos de eventos parados (docs/arquitetura.md, "Coleções arquivadas"). O
// Rekognition cobra todo mês pelos rostos guardados em cada coleção; evento sem atividade há
// DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR dias tem a coleção apagada e os rostos tirados do banco
// (`eventos.rostos_arquivados_em`). Se alguém buscar nele depois, a busca pede a reindexação e
// avisa que está sendo preparada; a reindexação anda em partes (na própria busca, depois da
// resposta, e no job de revisão) até todas as fotos passarem de novo pelo reconhecimento.
//
// Atividade (o critério mais seguro: a mais recente de todas, para nunca arquivar evento em uso):
// o fim do evento (ou o início, sem fim), a última busca por rosto (pública ou do painel), o
// último item enviado e a última venda paga. Ver `colecoesInativas` em src/dados/colecoes.ts.
//
// Idempotente e seguro se rodar duas vezes (ou duas ao mesmo tempo): a coleção é apagada antes de
// marcar o banco, e apagar coleção que não existe conta como feito; a marca guarda a primeira
// data; evento já arquivado não volta à lista. A reindexação tem reserva atômica por evento.

/** Dias sem nenhuma atividade para a coleção do evento ser apagada. */
export const DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR = 120;
const DIA_MS = 24 * 60 * 60 * 1000;
/** Coleções apagadas por execução do job, no máximo (cada uma é uma chamada à AWS). */
const COLECOES_POR_EXECUCAO = 50;
/** Itens lidos do banco por vez na reindexação. */
const LOTE_DA_REINDEXACAO = 12;
/** Itens indexados ao mesmo tempo: abaixo da cota de 5 IndexFaces por segundo em sa-east-1. */
const EM_PARALELO = 3;
/** A reserva vale o prazo mais esta folga (o último lote termina depois do prazo). */
const FOLGA_DA_RESERVA_MS = 2 * 60 * 1000;

export type ResultadoArquivamento = {
  arquivadas: number;
  falhas: number;
  /** Credencial ou permissão (rekognition:DeleteCollection) recusada: parou na primeira. */
  semPermissao?: true;
};

/**
 * Apaga as coleções dos eventos parados e marca no banco que os rostos não estão mais indexados.
 * Sem o Rekognition configurado (desenvolvimento, testes com dados de exemplo), não faz nada:
 * não há coleção a apagar, e os rostos de exemplo não podem sumir.
 */
export async function arquivarColecoesInativas(
  agora = Date.now(),
  { quantos = COLECOES_POR_EXECUCAO, prazoMs = 40_000 } = {},
): Promise<ResultadoArquivamento> {
  const resultado: ResultadoArquivamento = { arquivadas: 0, falhas: 0 };
  if (provedorFacial() !== "rekognition") return resultado;
  const inicio = Date.now();
  const limite = new Date(agora - DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR * DIA_MS);
  for (const eventoId of await colecoesInativas(limite, new Date(agora), quantos)) {
    if (Date.now() - inicio > prazoMs) break;
    try {
      await apagarColecao(eventoId);
    } catch (erro) {
      resultado.falhas++;
      console.error(`[colecoes] não apagou a coleção do evento ${eventoId}: ${nomeDoErro(erro)}`);
      // Sem a permissão (ou com a chave errada), as outras falhariam igual.
      if (ehErroDeCredencial(erro)) return { ...resultado, semPermissao: true };
      continue;
    }
    // Só depois de apagar no provedor. Se a marca falhar, a próxima execução apaga de novo (a
    // coleção que não existe conta como apagada) e marca.
    await marcarColecaoArquivada(eventoId, new Date(agora));
    resultado.arquivadas++;
  }
  return resultado;
}

type ItemParaIndexar = { id: string; chaveOriginal: string | null; tipo: "foto" | "video" };

/**
 * Lê o original do item no R2 e cadastra os rostos (foto inteira, ou os quadros do vídeo). Nunca
 * lança: devolve como terminou. Usado aqui e no "Cadastrar rostos que faltam" do painel.
 */
export async function indexarItemDoEvento(
  eventoId: string,
  item: ItemParaIndexar,
): Promise<IndexacaoDeRostos | "sem_original"> {
  if (!item.chaveOriginal) return "sem_original";
  let original: Buffer;
  try {
    original = await lerOriginal(item.chaveOriginal);
  } catch (erro) {
    console.error(`[rostos] falha ao ler o original do item ${item.id}: ${nomeDoErro(erro)}`);
    return "falha";
  }
  return item.tipo === "video"
    ? indexarRostosDoVideo(eventoId, item.id, () => quadrosParaRostos(original))
    : indexarRostosDaFoto(eventoId, item.id, original);
}

export type ResultadoReindexacao = {
  situacao: "concluida" | "parcial" | "ocupada" | "falha_credencial" | "desligado";
  indexadas: number;
  falhas: number;
};

/**
 * Reindexa o evento arquivado, em lotes, até `prazoMs`: cada item que ainda não passou pelo
 * reconhecimento vai de novo ao Rekognition (que recria a coleção). Uma reindexação por vez por
 * evento (reserva atômica); quem chega com outra em andamento recebe `ocupada`. Ao passar por
 * todos os itens, o evento volta ao normal; os que falharam ficam pendentes no painel ("Cadastrar
 * rostos que faltam"), como no envio. Sem terminar no prazo, solta a reserva e a próxima busca
 * (ou o job) continua de onde parou, já que os feitos não voltam à lista.
 */
export async function reindexarEventoArquivado(
  eventoId: string,
  prazoMs: number,
  agora = Date.now(),
): Promise<ResultadoReindexacao> {
  const resultado: ResultadoReindexacao = { situacao: "parcial", indexadas: 0, falhas: 0 };
  if (provedorFacial() !== "rekognition" || !r2Configurado()) {
    return { ...resultado, situacao: "desligado" };
  }
  const reservada = await reservarReindexacao(
    eventoId,
    new Date(agora),
    new Date(agora + prazoMs + FOLGA_DA_RESERVA_MS),
  );
  if (!reservada) return { ...resultado, situacao: "ocupada" };

  const inicio = Date.now();
  let depoisDe: string | null = null;
  try {
    for (;;) {
      const itens = await fotosParaIndexar(eventoId, depoisDe, LOTE_DA_REINDEXACAO);
      const feitos = await emParalelo(itens, EM_PARALELO, (item) =>
        indexarItemDoEvento(eventoId, item),
      );
      for (const r of feitos) {
        if (r.ok && r.valor === "indexada") resultado.indexadas++;
        else if (r.ok && r.valor === "falha_credencial") resultado.situacao = "falha_credencial";
        else if (!r.ok || r.valor === "falha") resultado.falhas++;
      }
      if (resultado.situacao === "falha_credencial") return resultado;
      if (itens.length < LOTE_DA_REINDEXACAO) {
        await concluirReindexacao(eventoId);
        resultado.situacao = "concluida";
        if (resultado.falhas > 0) {
          console.error(
            `[colecoes] evento ${eventoId} reindexado com ${resultado.falhas} item(ns) com falha`,
          );
        }
        return resultado;
      }
      depoisDe = itens[itens.length - 1].id;
      if (Date.now() - inicio > prazoMs) return resultado;
    }
  } finally {
    if (resultado.situacao !== "concluida") {
      await soltarReindexacao(eventoId).catch((erro) =>
        console.error(`[colecoes] não soltou a reserva do evento ${eventoId}: ${nomeDoErro(erro)}`),
      );
    }
  }
}

/**
 * No job de revisão, com o tempo que sobra: continua as reindexações pedidas por buscas (o
 * pedido mais antigo primeiro). Só os eventos que alguém procurou voltam a ser indexados.
 */
export async function continuarReindexacoesPedidas(prazoMs: number, agora = Date.now()) {
  const inicio = Date.now();
  const resultado = { eventos: 0, concluidas: 0, indexadas: 0 };
  if (provedorFacial() !== "rekognition" || !r2Configurado()) return resultado;
  for (const eventoId of await reindexacoesPedidas(new Date(agora), 5)) {
    const sobra = prazoMs - (Date.now() - inicio);
    if (sobra < 5_000) break;
    const r = await reindexarEventoArquivado(eventoId, sobra, Date.now());
    if (r.situacao === "ocupada" || r.situacao === "desligado") continue;
    resultado.eventos++;
    resultado.indexadas += r.indexadas;
    if (r.situacao === "concluida") resultado.concluidas++;
    if (r.situacao === "falha_credencial") break;
  }
  return resultado;
}
