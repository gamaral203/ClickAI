"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  atualizarAssinatura,
  criarAssinatura,
  definirAssinaturaAtiva,
  excluirAssinatura,
  salvarConfiguracoesGestao,
} from "@/dados";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { CONFIG, validarAssinatura, type CampoAssinatura } from "@/lib/painel-de-uso";
import { exigirGestor } from "@/servicos/sessao";

// Ações do Painel de uso (/admin/uso). Cada uma confere o papel de gestor no servidor
// (exigirGestor) antes de qualquer leitura do formulário.

const CAMINHO = "/admin/uso";

export type EstadoAssinatura = {
  ok?: boolean;
  erros?: Partial<Record<CampoAssinatura | "geral", string>>;
};

/** Cria ou edita uma assinatura. Valores digitados em reais ou dólares; no banco, centavos. */
export async function salvarAssinaturaAcao(
  _anterior: EstadoAssinatura,
  formulario: FormData,
): Promise<EstadoAssinatura> {
  const gestor = await exigirGestor(CAMINHO);
  const entrada: Record<string, unknown> = {};
  for (const [chave, valor] of formulario.entries()) {
    if (typeof valor === "string") entrada[chave] = valor;
  }
  const r = validarAssinatura(entrada);
  if (!r.ok) return { erros: r.erros };
  if (r.id) {
    if (!(await atualizarAssinatura(r.id, r.dados))) {
      return { erros: { geral: "Assinatura não encontrada. Atualize a página." } };
    }
  } else {
    await criarAssinatura(r.dados, gestor.id);
  }
  revalidatePath(CAMINHO);
  return { ok: true };
}

export type ResultadoAcaoUso = { erro?: string };

const id = z.uuid();

/** Desativa (para de contar no gasto e nos avisos) ou reativa uma assinatura. */
export async function alternarAssinaturaAcao(
  assinaturaId: unknown,
  ativa: unknown,
): Promise<ResultadoAcaoUso> {
  await exigirGestor(CAMINHO);
  const dados = z.object({ id, ativa: z.boolean() }).safeParse({ id: assinaturaId, ativa });
  if (!dados.success) return { erro: "Assinatura não encontrada." };
  if (!(await definirAssinaturaAtiva(dados.data.id, dados.data.ativa))) {
    return { erro: "Assinatura não encontrada." };
  }
  revalidatePath(CAMINHO);
  return {};
}

/** Exclui de vez (a confirmação é feita na tela, antes de chamar). */
export async function excluirAssinaturaAcao(assinaturaId: unknown): Promise<ResultadoAcaoUso> {
  await exigirGestor(CAMINHO);
  const dados = id.safeParse(assinaturaId);
  if (!dados.success) return { erro: "Assinatura não encontrada." };
  if (!(await excluirAssinatura(dados.data))) return { erro: "Assinatura não encontrada." };
  revalidatePath(CAMINHO);
  return {};
}

export type CampoConfiguracao = "cotacao" | "limiteDia" | "limiteMes";
export type EstadoConfiguracoes = {
  ok?: boolean;
  erros?: Partial<Record<CampoConfiguracao, string>>;
};

const formularioConfiguracoes = z.object({
  cotacao: z.string().trim().max(12),
  limiteDia: z
    .string()
    .trim()
    .regex(/^\d{1,7}$/, "Use um número inteiro (ex.: 100)."),
  limiteMes: z
    .string()
    .trim()
    .regex(/^\d{1,8}$/, "Use um número inteiro (ex.: 3000)."),
});

/** Cotação do dólar (digitada em reais, gravada em centavos) e limites do plano do Resend. */
export async function salvarConfiguracoesAcao(
  _anterior: EstadoConfiguracoes,
  formulario: FormData,
): Promise<EstadoConfiguracoes> {
  const gestor = await exigirGestor(CAMINHO);
  const r = formularioConfiguracoes.safeParse({
    cotacao: formulario.get("cotacao") ?? "",
    limiteDia: formulario.get("limiteDia") ?? "",
    limiteMes: formulario.get("limiteMes") ?? "",
  });
  if (!r.success) {
    const erros: EstadoConfiguracoes["erros"] = {};
    for (const p of r.error.issues) erros[p.path[0] as CampoConfiguracao] ??= p.message;
    return { erros };
  }
  let cotacao: number | undefined;
  if (r.data.cotacao) {
    const centavos = reaisParaCentavos(r.data.cotacao);
    if (centavos === null || centavos < 100 || centavos > 5000) {
      return { erros: { cotacao: "Informe a cotação em reais, entre R$ 1,00 e R$ 50,00." } };
    }
    cotacao = centavos;
  }
  const limiteDia = Number(r.data.limiteDia);
  const limiteMes = Number(r.data.limiteMes);
  if (limiteDia < 1) return { erros: { limiteDia: "O limite precisa ser pelo menos 1." } };
  if (limiteMes < limiteDia) {
    return { erros: { limiteMes: "O limite do mês não pode ser menor que o do dia." } };
  }
  await salvarConfiguracoesGestao(
    {
      [CONFIG.cotacaoUsd]: cotacao,
      [CONFIG.limiteEmailDia]: limiteDia,
      [CONFIG.limiteEmailMes]: limiteMes,
    },
    gestor.id,
  );
  revalidatePath(CAMINHO);
  return { ok: true };
}
