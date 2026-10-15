"use server";

import { revalidatePath } from "next/cache";

import type { CampoConfigMarca } from "@/lib/protecao-previas";
import {
  confirmarRegeracao,
  regerarLoteDoGestor,
  salvarProtecao,
} from "@/servicos/protecao-previas";
import { exigirGestor } from "@/servicos/sessao";

// Ações da proteção das prévias (/admin/marca-dagua). Cada uma confere o papel de gestor no
// servidor (exigirGestor) antes de ler qualquer entrada; os limites são conferidos de novo no
// serviço (src/servicos/protecao-previas.ts).

const CAMINHO = "/admin/marca-dagua";

/** Prazo de cada lote da regeração pela tela (abaixo do maxDuration da página). */
const PRAZO_DO_LOTE_MS = 50 * 1000;

export type EstadoMarca = {
  ok?: string;
  erros?: Partial<Record<CampoConfigMarca | "geral", string>>;
};

export async function salvarProtecaoAcao(
  _anterior: EstadoMarca,
  formulario: FormData,
): Promise<EstadoMarca> {
  const gestor = await exigirGestor(CAMINHO);
  const r = await salvarProtecao(gestor, {
    tamanhoPct: formulario.get("tamanhoPct"),
    quantidade: formulario.get("quantidade"),
    opacidadePct: formulario.get("opacidadePct"),
    larguraPrevia: formulario.get("larguraPrevia"),
    qualidade: formulario.get("qualidade"),
    variacao: formulario.get("variacao") === "on",
  });
  if ("erros" in r) return { erros: r.erros };
  revalidatePath(CAMINHO);
  return {
    ok: `Configuração salva (revisão ${r.revisao}). As fotos enviadas a partir de agora já saem com ela.`,
  };
}

export async function confirmarRegeracaoAcao(revisao: unknown): Promise<{ erro?: string }> {
  const gestor = await exigirGestor(CAMINHO);
  const r = await confirmarRegeracao(gestor, typeof revisao === "number" ? revisao : NaN);
  if ("erro" in r) return { erro: r.erro };
  revalidatePath(CAMINHO);
  return {};
}

/** Um lote da regeração já confirmada. A tela chama de novo enquanto houver `restantes`. */
export async function regerarLoteAcao() {
  const gestor = await exigirGestor(CAMINHO);
  try {
    return await regerarLoteDoGestor(gestor, PRAZO_DO_LOTE_MS);
  } catch (erro) {
    console.error("[marca] falha num lote da regeração pela tela", erro);
    return { erro: "Não foi possível regerar agora. Tente de novo em instantes." };
  }
}
