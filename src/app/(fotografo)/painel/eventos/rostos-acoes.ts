"use server";

import { revalidatePath } from "next/cache";

import {
  buscarEventoDoFotografo,
  fotosParaIndexar,
  limparRostosDoEvento,
  rostosDoEvento,
} from "@/dados";
import { ehIdValido } from "@/lib/validacao";
import { lerOriginal, r2Configurado } from "@/lib/r2";
import { apagarRostos, ehErroDeCredencial, nomeDoErro, provedorFacial } from "@/lib/reconhecimento";
import { indexarRostosDaFoto } from "@/servicos/envios";
import { exigirFotografo } from "@/servicos/sessao";

/** Fotos por chamada: cada uma lê o original no R2 e vai ao Rekognition (~1 s cada). */
const POR_CHAMADA = 8;

export type ResultadoIndexacao =
  | { ok: true; indexadas: number; falhas: number; proximo: string | null }
  | { ok: false; erro: string };

/** Credencial errada falha em todas as fotos: para na primeira e diz o que conferir. */
const ERRO_DE_CREDENCIAL =
  "Não foi possível falar com o reconhecimento facial: confira as credenciais do Rekognition " +
  "(REKOGNITION_REGIAO, REKOGNITION_ACCESS_KEY_ID e REKOGNITION_SECRET_ACCESS_KEY) e as " +
  "permissões do usuário na AWS.";

/**
 * Cadastra os rostos das fotos do evento que ainda não estão na busca por selfie (enviadas antes
 * do reconhecimento estar ligado, ou em que ele falhou). Anda em lotes: a tela chama de novo com
 * o `proximo` até voltar `null`.
 */
export async function indexarRostosDoEventoAcao(
  eventoId: unknown,
  depoisDe: unknown,
): Promise<ResultadoIndexacao> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const idValido = (v: unknown): v is string => typeof v === "string" && ehIdValido(v);
  if (!idValido(eventoId) || (depoisDe !== null && !idValido(depoisDe))) {
    return { ok: false, erro: "Evento inválido." };
  }
  const evento = await buscarEventoDoFotografo(eventoId, conta.id);
  if (!evento) return { ok: false, erro: "Evento não encontrado." };
  if (provedorFacial() !== "rekognition" || !r2Configurado()) {
    return { ok: false, erro: "O reconhecimento facial não está configurado no servidor." };
  }

  const fotos = await fotosParaIndexar(evento.id, depoisDe, POR_CHAMADA);
  let indexadas = 0;
  let falhas = 0;
  for (const foto of fotos) {
    if (!foto.chaveOriginal) continue;
    let original: Buffer;
    try {
      original = await lerOriginal(foto.chaveOriginal);
    } catch (erro) {
      console.error(`[rostos] falha ao ler o original da foto ${foto.id}`, erro);
      falhas++;
      continue;
    }
    const resultado = await indexarRostosDaFoto(evento.id, foto.id, original);
    if (resultado === "indexada") indexadas++;
    else if (resultado === "falha_credencial") {
      revalidatePath(`/painel/eventos/${evento.id}`);
      return { ok: false, erro: ERRO_DE_CREDENCIAL };
    } else falhas++;
  }
  const proximo = fotos.length === POR_CHAMADA ? fotos[fotos.length - 1].id : null;
  if (!proximo) revalidatePath(`/painel/eventos/${evento.id}`);
  return { ok: true, indexadas, falhas, proximo };
}

/**
 * Prepara o evento para cadastrar todas as fotos de novo (depois de trocar a região ou o filtro
 * de qualidade, por exemplo): apaga os rostos da coleção e da tabela `rostos` e tira a marca de
 * cadastrada. Depois a tela chama `indexarRostosDoEventoAcao` em lotes, como no "que faltam".
 * Só o dono do evento.
 */
export async function reiniciarRostosDoEventoAcao(
  eventoId: unknown,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (typeof eventoId !== "string" || !ehIdValido(eventoId)) {
    return { ok: false, erro: "Evento inválido." };
  }
  const evento = await buscarEventoDoFotografo(eventoId, conta.id);
  if (!evento) return { ok: false, erro: "Evento não encontrado." };
  if (provedorFacial() !== "rekognition" || !r2Configurado()) {
    return { ok: false, erro: "O reconhecimento facial não está configurado no servidor." };
  }

  try {
    await apagarRostos(evento.id, await rostosDoEvento(evento.id));
  } catch (erro) {
    const nome = nomeDoErro(erro);
    // Sem a permissão opcional DeleteFaces, sem a coleção (outra região) ou com ids que a
    // coleção não conhece, segue: o rosto antigo que sobrar na coleção não aparece na busca,
    // porque a foto volta pelo id e a posição vem só dos rostos gravados de novo.
    const podeSeguir =
      nome === "AccessDeniedException" ||
      nome === "ResourceNotFoundException" ||
      nome === "InvalidParameterException";
    console.error(`[rostos] não apagou os rostos antigos do evento ${evento.id}: ${nome}`);
    if (!podeSeguir) {
      return {
        ok: false,
        erro: ehErroDeCredencial(erro)
          ? ERRO_DE_CREDENCIAL
          : "Não foi possível falar com o reconhecimento facial. Tente de novo em instantes.",
      };
    }
  }
  await limparRostosDoEvento(evento.id);
  revalidatePath(`/painel/eventos/${evento.id}`);
  return { ok: true };
}
