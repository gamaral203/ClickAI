"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buscarEventoDoFotografo, corrigirNumeroDaFoto } from "@/dados";
import { ehIdValido } from "@/lib/validacao";
import { lerNumerosDoEvento } from "@/servicos/numeros";
import { exigirFotografo } from "@/servicos/sessao";

export type ResultadoLeituraDoEvento =
  { ok: true; lidas: number; falhas: number; proximo: string | null } | { ok: false; erro: string };

const ERRO_DE_CREDENCIAL =
  "Não foi possível falar com o Rekognition: confira as credenciais (REKOGNITION_*) e se o " +
  "usuário na AWS tem a permissão rekognition:DetectText.";

/**
 * Lê o número de peito das fotos do evento que ainda não passaram pela leitura (enviadas antes
 * de ligar a opção, ou em que ela falhou). Em lotes: a tela chama de novo com o `proximo` até
 * voltar `null`. Só o dono do evento, e só com a opção ligada.
 */
export async function lerNumerosDoEventoAcao(
  eventoId: unknown,
  depoisDe: unknown,
): Promise<ResultadoLeituraDoEvento> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const idValido = (v: unknown): v is string => typeof v === "string" && ehIdValido(v);
  if (!idValido(eventoId) || (depoisDe !== null && !idValido(depoisDe))) {
    return { ok: false, erro: "Evento inválido." };
  }
  const evento = await buscarEventoDoFotografo(eventoId, conta.id);
  if (!evento) return { ok: false, erro: "Evento não encontrado." };
  if (!evento.lerNumeros) {
    return {
      ok: false,
      erro: "Ligue “Ler número de peito nas fotos” nas configurações do evento.",
    };
  }
  const r = await lerNumerosDoEvento(evento.id, depoisDe);
  if (!r.ok) {
    revalidatePath(`/painel/eventos/${evento.id}`);
    return {
      ok: false,
      erro:
        r.motivo === "falha_credencial"
          ? ERRO_DE_CREDENCIAL
          : "A leitura do número de peito não está configurada no servidor.",
    };
  }
  if (!r.proximo) revalidatePath(`/painel/eventos/${evento.id}`);
  return r;
}

const correcao = z.object({
  fotoId: z.uuid(),
  acao: z.enum(["adicionar", "remover"]),
  numero: z.string().max(20),
});

export type ResultadoCorrecaoDoNumero =
  { ok: true; numeros: string[] } | { ok: false; erro: string };

/**
 * Põe ou tira um número de peito de uma foto. O servidor confere que a foto é de um evento do
 * fotógrafo (ou, para o colaborador, que foi ele quem a enviou): src/dados/numeros.ts.
 */
export async function corrigirNumeroAcao(
  fotoId: unknown,
  acao: unknown,
  numero: unknown,
): Promise<ResultadoCorrecaoDoNumero> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const dados = correcao.safeParse({ fotoId, acao, numero });
  if (!dados.success) return { ok: false, erro: "Pedido inválido." };
  const r = await corrigirNumeroDaFoto(dados.data.fotoId, conta.id, {
    acao: dados.data.acao,
    numero: dados.data.numero,
  });
  if (!r.ok) {
    return {
      ok: false,
      erro:
        r.erro === "numero_invalido" ? "Use só números, até 6 dígitos." : "Foto não encontrada.",
    };
  }
  revalidatePath(`/painel/eventos/${r.eventoId}`);
  return { ok: true, numeros: r.numeros };
}
