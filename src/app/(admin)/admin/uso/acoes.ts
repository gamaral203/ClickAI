"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  atualizarAssinatura,
  buscarAssinaturaDoMes,
  contarCobrancas,
  criarAssinatura,
  definirAssinaturaAtiva,
  definirRenovacaoDoMes,
  excluirAssinatura,
  incluirAssinaturaNoMes,
  lerConfiguracoesGestao,
  marcarAssinaturaDoMesPaga,
  salvarConfiguracoesGestao,
} from "@/dados";
import { dividirArredondando, lerCotacao } from "@/lib/financeiro-plataforma";
import { reaisParaCentavos } from "@/lib/dinheiro";
import {
  CONFIG,
  CREDITOS_AWS_TOTAL_MAXIMO_CENTAVOS,
  hojeEmBrasilia,
  periodoDoMes,
  validarAssinatura,
  type CampoAssinatura,
} from "@/lib/painel-de-uso";
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
  // Reativada, volta a aparecer no mês atual (se já não estiver).
  if (dados.data.ativa) {
    await incluirAssinaturaNoMes(dados.data.id, periodoDoMes("atual").diaInicio);
  }
  revalidatePath(CAMINHO);
  return {};
}

/** Exclui de vez, só sem cobranças (a confirmação é feita na tela, antes de chamar). */
export async function excluirAssinaturaAcao(assinaturaId: unknown): Promise<ResultadoAcaoUso> {
  await exigirGestor(CAMINHO);
  const dados = id.safeParse(assinaturaId);
  if (!dados.success) return { erro: "Assinatura não encontrada." };
  // Com cobranças no histórico, não exclui: o histórico financeiro nunca é apagado junto.
  if ((await contarCobrancas(dados.data)) > 0) {
    return { erro: "Tem cobranças no histórico: desative em vez de excluir." };
  }
  if (!(await excluirAssinatura(dados.data))) return { erro: "Assinatura não encontrada." };
  revalidatePath(CAMINHO);
  return {};
}

export type CampoConfiguracao = "cotacao" | "limiteDia" | "limiteMes" | "creditosAws";
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
  /** Total de créditos da AWS em dólares ("100,00"); em branco, fica como está. */
  creditosAws: z.string().trim().max(12),
});

/**
 * Cotação do dólar (digitada em reais, gravada em centavos), limites do plano do Resend e o total
 * de créditos da AWS (digitado em dólares, gravado em centavos de dólar).
 */
export async function salvarConfiguracoesAcao(
  _anterior: EstadoConfiguracoes,
  formulario: FormData,
): Promise<EstadoConfiguracoes> {
  const gestor = await exigirGestor(CAMINHO);
  const r = formularioConfiguracoes.safeParse({
    cotacao: formulario.get("cotacao") ?? "",
    limiteDia: formulario.get("limiteDia") ?? "",
    limiteMes: formulario.get("limiteMes") ?? "",
    creditosAws: formulario.get("creditosAws") ?? "",
  });
  if (!r.success) {
    const erros: EstadoConfiguracoes["erros"] = {};
    for (const p of r.error.issues) erros[p.path[0] as CampoConfiguracao] ??= p.message;
    return { erros };
  }
  let cotacao: number | undefined;
  let cotacaoPrecisa: number | undefined;
  if (r.data.cotacao) {
    // Até 4 casas ("5,3495"): a de 4 casas vale para as cobranças em dólar do Financeiro; a de
    // centavos, arredondada, para os totais deste painel.
    const dezMilesimos = lerCotacao(r.data.cotacao);
    if (dezMilesimos === null) {
      return { erros: { cotacao: "Informe a cotação em reais, entre R$ 1,00 e R$ 50,00." } };
    }
    cotacaoPrecisa = dezMilesimos;
    cotacao = dividirArredondando(dezMilesimos, 100);
  }
  const limiteDia = Number(r.data.limiteDia);
  const limiteMes = Number(r.data.limiteMes);
  if (limiteDia < 1) return { erros: { limiteDia: "O limite precisa ser pelo menos 1." } };
  if (limiteMes < limiteDia) {
    return { erros: { limiteMes: "O limite do mês não pode ser menor que o do dia." } };
  }
  let creditosAws: number | undefined;
  if (r.data.creditosAws) {
    const centavos = reaisParaCentavos(r.data.creditosAws.replace(/^US\$/i, ""));
    if (centavos === null || centavos < 100 || centavos > CREDITOS_AWS_TOTAL_MAXIMO_CENTAVOS) {
      return {
        erros: { creditosAws: "Informe o total em dólares, entre US$ 1,00 e US$ 10.000,00." },
      };
    }
    creditosAws = centavos;
  }
  await salvarConfiguracoesGestao(
    {
      [CONFIG.cotacaoUsd]: cotacao,
      [CONFIG.cotacaoUsdPrecisa]: cotacaoPrecisa,
      [CONFIG.limiteEmailDia]: limiteDia,
      [CONFIG.limiteEmailMes]: limiteMes,
      [CONFIG.creditosAwsTotal]: creditosAws,
    },
    gestor.id,
  );
  revalidatePath(CAMINHO);
  return { ok: true };
}

// ---------------------------------------------------------------- Assinaturas do mês

/**
 * Marca ou desmarca como paga a assinatura de um mês. Marcar lança a cobrança paga no Financeiro
 * (uma por linha); desmarcar apaga essa cobrança (src/dados/painel-de-uso.ts).
 */
export async function marcarAssinaturaPagaAcao(
  assinaturaDoMesId: unknown,
  paga: unknown,
): Promise<ResultadoAcaoUso> {
  const gestor = await exigirGestor(CAMINHO);
  const dados = z.object({ id, paga: z.boolean() }).safeParse({ id: assinaturaDoMesId, paga });
  if (!dados.success) return { erro: "Assinatura não encontrada." };
  const { cotacaoDezMilesimos } = await lerConfiguracoesGestao();
  const r = await marcarAssinaturaDoMesPaga(dados.data.id, dados.data.paga, gestor.id, {
    cotacaoDezMilesimos,
    hoje: hojeEmBrasilia(),
  });
  if (r === "nao-encontrada") return { erro: "Assinatura não encontrada." };
  if (r === "sem-cotacao") return { erro: "Defina a cotação do dólar antes de marcar como paga." };
  // A cobrança paga muda os Gastos e o Resultado do Financeiro e o histórico da despesa.
  revalidatePath(CAMINHO);
  revalidatePath("/admin/uso/financeiro");
  revalidatePath("/admin/uso/despesas/[id]", "page");
  return {};
}

/**
 * Liga ou desliga o "Renova no próximo mês?". Só no mês atual: o mês seguinte é montado na virada
 * a partir dele, e mudar um mês passado não teria efeito.
 */
export async function renovarNoProximoMesAcao(
  assinaturaDoMesId: unknown,
  renova: unknown,
): Promise<ResultadoAcaoUso> {
  await exigirGestor(CAMINHO);
  const dados = z.object({ id, renova: z.boolean() }).safeParse({ id: assinaturaDoMesId, renova });
  if (!dados.success) return { erro: "Assinatura não encontrada." };
  const linha = await buscarAssinaturaDoMes(dados.data.id);
  if (!linha) return { erro: "Assinatura não encontrada." };
  if (linha.mes !== periodoDoMes("atual").diaInicio) {
    return { erro: "Só dá para mudar a renovação no mês atual." };
  }
  await definirRenovacaoDoMes(dados.data.id, dados.data.renova);
  revalidatePath(CAMINHO);
  return {};
}
