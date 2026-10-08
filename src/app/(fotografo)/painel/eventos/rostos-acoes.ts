"use server";

import { revalidatePath } from "next/cache";

import { buscarEventoDoFotografo, fotosParaIndexar } from "@/dados";
import { ehIdValido } from "@/lib/validacao";
import { lerOriginal, r2Configurado } from "@/lib/r2";
import { provedorFacial } from "@/lib/reconhecimento";
import { indexarRostosDaFoto } from "@/servicos/envios";
import { exigirFotografo } from "@/servicos/sessao";

/** Fotos por chamada: cada uma lê o original no R2 e vai ao Rekognition (~1 s cada). */
const POR_CHAMADA = 8;

export type ResultadoIndexacao =
  { ok: true; processadas: number; proximo: string | null } | { ok: false; erro: string };

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
  let processadas = 0;
  for (const foto of fotos) {
    if (foto.temRosto || !foto.chaveOriginal) continue;
    try {
      await indexarRostosDaFoto(evento.id, foto.id, await lerOriginal(foto.chaveOriginal));
      processadas++;
    } catch (erro) {
      console.error(`[rostos] falha ao ler o original da foto ${foto.id}`, erro);
    }
  }
  const proximo = fotos.length === POR_CHAMADA ? fotos[fotos.length - 1].id : null;
  if (!proximo) revalidatePath(`/painel/eventos/${evento.id}`);
  return { ok: true, processadas, proximo };
}
