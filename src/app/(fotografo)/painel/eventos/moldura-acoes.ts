"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recusarSeEmManutencao } from "@/servicos/manutencao";
import {
  confirmarEnvioDeMoldura,
  iniciarEnvioDeMoldura,
  removerMolduraDoEvento,
  type InicioDoEnvio,
  type ResultadoDaMoldura,
} from "@/servicos/molduras";
import { exigirFotografo } from "@/servicos/sessao";

// Moldura do evento (docs/arquitetura.md, "Moldura do evento"). Server Actions são endpoints
// públicos: a entrada é conferida no serviço (src/servicos/molduras.ts), que só grava em evento
// do fotógrafo logado (dono; colaborador e outro fotógrafo recebem "Evento não encontrado").

function atualizar(eventoId: unknown) {
  const id = z.uuid().safeParse(eventoId);
  if (id.success) revalidatePath(`/painel/eventos/${id.data}`);
}

/** Passo 1: URL assinada para o navegador mandar o PNG direto ao R2. */
export async function iniciarMolduraAcao(dados: {
  eventoId: unknown;
  formato: unknown;
  tamanho: unknown;
  tipo: unknown;
}): Promise<InicioDoEnvio> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const manutencao = await recusarSeEmManutencao();
  if (manutencao) return { erro: manutencao };
  return iniciarEnvioDeMoldura(conta.id, dados);
}

/** Passo 2: o servidor lê o PNG enviado, confere e grava a moldura. */
export async function confirmarMolduraAcao(dados: {
  eventoId: unknown;
  formato: unknown;
  chave: unknown;
}): Promise<ResultadoDaMoldura> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const manutencao = await recusarSeEmManutencao();
  if (manutencao) return { ok: false, erro: manutencao };
  const resultado = await confirmarEnvioDeMoldura(conta.id, dados);
  if (resultado.ok) atualizar(dados.eventoId);
  return resultado;
}

export async function removerMolduraAcao(dados: {
  eventoId: unknown;
  formato: unknown;
}): Promise<ResultadoDaMoldura> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const manutencao = await recusarSeEmManutencao();
  if (manutencao) return { ok: false, erro: manutencao };
  const resultado = await removerMolduraDoEvento(conta.id, dados);
  if (resultado.ok) atualizar(dados.eventoId);
  return resultado;
}
