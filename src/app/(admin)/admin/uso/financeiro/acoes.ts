"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  atualizarCobranca,
  buscarAssinatura,
  criarCobranca,
  excluirCobranca,
  importarDespesas,
  lerConfiguracoesGestao,
  salvarConfiguracoesGestao,
  salvarSaldoInformado,
  type ResultadoImportacao,
} from "@/dados";
import { DESPESAS_INICIAIS } from "@/lib/despesas-iniciais";
import { reaisParaCentavos } from "@/lib/dinheiro";
import {
  diaValido,
  dividirArredondando,
  lerCotacao,
  lerPercentualPb,
  validarCobranca,
  type CampoCobranca,
} from "@/lib/financeiro-plataforma";
import { CONFIG } from "@/lib/painel-de-uso";
import { exigirGestor } from "@/servicos/sessao";

// Ações do Financeiro da ClicouAí e do histórico de cobranças das despesas. Cada uma confere o
// papel de gestor no servidor (exigirGestor) antes de ler o formulário. Nenhuma toca em pedido,
// lançamento ou saque: só despesas e configurações da gestão.

const CAMINHO = "/admin/uso/financeiro";

function revalidar(assinaturaId?: string) {
  revalidatePath(CAMINHO);
  revalidatePath("/admin/uso");
  if (assinaturaId) revalidatePath(`/admin/uso/despesas/${assinaturaId}`);
}

// ---------------------------------------------------------------- Importação inicial

export type EstadoImportacao = { resultado?: ResultadoImportacao; erro?: string };

/** Importa as despesas iniciais (idempotente: rodar de novo não duplica). */
export async function importarDespesasIniciaisAcao(): Promise<EstadoImportacao> {
  const gestor = await exigirGestor(CAMINHO);
  try {
    const resultado = await importarDespesas(DESPESAS_INICIAIS, gestor.id);
    revalidar();
    return { resultado };
  } catch (erro) {
    console.error(
      "Falha ao importar as despesas iniciais",
      erro instanceof Error ? erro.name : "erro",
    );
    return { erro: "Não foi possível importar. Nada foi gravado; tente de novo." };
  }
}

// ---------------------------------------------------------------- Saldo informado

export type EstadoSaldo = { ok?: boolean; erros?: Partial<Record<"valor" | "dia", string>> };

/** Saldo da conta do Mercado Pago, digitado à mão com o dia (referência da conciliação). */
export async function salvarSaldoAcao(
  _anterior: EstadoSaldo,
  formulario: FormData,
): Promise<EstadoSaldo> {
  const gestor = await exigirGestor(CAMINHO);
  const r = z
    .object({ valor: z.string().trim().max(20), dia: z.string() })
    .safeParse({ valor: formulario.get("valor") ?? "", dia: formulario.get("dia") ?? "" });
  if (!r.success) return { erros: { valor: "Informe o saldo." } };
  const centavos = reaisParaCentavos(r.data.valor);
  if (centavos === null || centavos > 1_000_000_000) {
    return { erros: { valor: "Informe o saldo em reais, como 477,00." } };
  }
  if (!diaValido(r.data.dia)) return { erros: { dia: "Informe o dia do saldo." } };
  await salvarSaldoInformado(centavos, r.data.dia, gestor.id);
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------- Taxas e cotação

export type EstadoReferencias = {
  ok?: boolean;
  erros?: Partial<Record<"pix" | "cartao" | "cotacao", string>>;
};

/** Taxas de referência do Mercado Pago (Pix e cartão) e a cotação do dólar com 4 casas. */
export async function salvarReferenciasAcao(
  _anterior: EstadoReferencias,
  formulario: FormData,
): Promise<EstadoReferencias> {
  const gestor = await exigirGestor(CAMINHO);
  const texto = (nome: string) => String(formulario.get(nome) ?? "").slice(0, 20);
  const pix = lerPercentualPb(texto("pix"));
  const cartao = lerPercentualPb(texto("cartao"));
  const cotacao = lerCotacao(texto("cotacao"));
  const erros: EstadoReferencias["erros"] = {};
  if (pix === null) erros.pix = "Use um percentual como 0,99.";
  if (cartao === null) erros.cartao = "Use um percentual como 4,98.";
  if (cotacao === null) erros.cotacao = "Informe a cotação, entre R$ 1 e R$ 50 (ex.: 5,3495).";
  if (pix === null || cartao === null || cotacao === null) return { erros };
  await salvarConfiguracoesGestao(
    {
      [CONFIG.taxaPixPb]: pix,
      [CONFIG.taxaCartaoPb]: cartao,
      [CONFIG.cotacaoUsdPrecisa]: cotacao,
      // A de centavos (Painel de uso) segue a mesma cotação, arredondada.
      [CONFIG.cotacaoUsd]: dividirArredondando(cotacao, 100),
    },
    gestor.id,
  );
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------- Cobranças

export type EstadoCobranca = {
  ok?: boolean;
  erros?: Partial<Record<CampoCobranca | "geral", string>>;
};

/** Cria ou edita uma cobrança de uma despesa. */
export async function salvarCobrancaAcao(
  _anterior: EstadoCobranca,
  formulario: FormData,
): Promise<EstadoCobranca> {
  const gestor = await exigirGestor(CAMINHO);
  const entrada: Record<string, unknown> = {};
  for (const [chave, valor] of formulario.entries()) {
    if (typeof valor === "string") entrada[chave] = valor;
  }
  const { cotacaoDezMilesimos } = await lerConfiguracoesGestao();
  const r = validarCobranca(entrada, cotacaoDezMilesimos);
  if (!r.ok) return { erros: r.erros };
  if (!(await buscarAssinatura(r.dados.assinaturaId))) {
    return { erros: { geral: "Despesa não encontrada. Atualize a página." } };
  }
  if (r.id) {
    if (!(await atualizarCobranca(r.id, r.dados))) {
      return { erros: { geral: "Cobrança não encontrada. Atualize a página." } };
    }
  } else {
    await criarCobranca(r.dados, gestor.id);
  }
  revalidar(r.dados.assinaturaId);
  return { ok: true };
}

export type ResultadoAcaoCobranca = { erro?: string };

/** Exclui uma cobrança lançada errado (a confirmação é feita na tela). */
export async function excluirCobrancaAcao(
  cobrancaId: unknown,
  assinaturaId: unknown,
): Promise<ResultadoAcaoCobranca> {
  await exigirGestor(CAMINHO);
  const ids = z.object({ c: z.uuid(), a: z.uuid() }).safeParse({ c: cobrancaId, a: assinaturaId });
  if (!ids.success) return { erro: "Cobrança não encontrada." };
  if (!(await excluirCobranca(ids.data.c, ids.data.a))) return { erro: "Cobrança não encontrada." };
  revalidar(ids.data.a);
  return {};
}
