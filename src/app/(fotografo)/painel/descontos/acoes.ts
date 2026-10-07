"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  codigoDeCupomEmUso,
  filtrarEventosDoFotografo,
  listarCuponsDoFotografo,
  salvarCupom,
  salvarFaixas,
  type DadosCupom,
} from "@/dados";
import { campoParaIso } from "@/lib/datas";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { exigirFotografo } from "@/servicos/sessao";

// ---------------------------------------------------------------- Desconto progressivo

const MAXIMO_FAIXAS = 5;

const faixas = z
  .array(
    z.object({
      quantidadeMin: z.number().int().min(2, "A partir de 2 fotos.").max(500, "Até 500 fotos."),
      descontoPct: z.number().int().min(1, "De 1% a 90%.").max(90, "De 1% a 90%."),
    }),
  )
  .max(MAXIMO_FAIXAS, `Até ${MAXIMO_FAIXAS} faixas.`)
  .superRefine((lista, ctx) => {
    const ordenadas = [...lista].sort((a, b) => a.quantidadeMin - b.quantidadeMin);
    for (let i = 1; i < ordenadas.length; i++) {
      if (ordenadas[i].quantidadeMin === ordenadas[i - 1].quantidadeMin) {
        ctx.addIssue({
          code: "custom",
          message: "Cada faixa precisa de uma quantidade diferente.",
        });
        return;
      }
      if (ordenadas[i].descontoPct <= ordenadas[i - 1].descontoPct) {
        ctx.addIssue({
          code: "custom",
          message:
            "Quem compra mais precisa ganhar mais desconto: aumente o percentual a cada faixa.",
        });
        return;
      }
    }
  });

/**
 * Salva as faixas de desconto progressivo: a regra padrão (`eventoId` nulo) ou as próprias de
 * um evento do fotógrafo. Lista vazia no evento: volta a usar a regra padrão.
 */
export async function salvarFaixasAcao(
  eventoId: string | null,
  lista: unknown,
): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/descontos");
  if (eventoId !== null && !z.uuid().safeParse(eventoId).success) {
    return { erro: "Evento não encontrado." };
  }
  const dados = faixas.safeParse(lista);
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Confira as faixas." };
  const salvou = await salvarFaixas(conta.id, eventoId, dados.data);
  if (!salvou) return { erro: "Evento não encontrado." };
  revalidatePath(eventoId ? `/painel/eventos/${eventoId}` : "/painel/descontos");
  return {};
}

// ---------------------------------------------------------------- Cupons

export type CampoCupom =
  "codigo" | "tipo" | "valor" | "usosMax" | "inicioEm" | "expiraEm" | "minimoValor" | "eventoIds";

export type EstadoCupom = { ok?: boolean; erros?: Partial<Record<CampoCupom, string>> };

const opcional = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const formularioCupom = z.object({
  cupomId: z.preprocess(opcional, z.uuid().optional()),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,20}$/, "Use de 3 a 20 letras ou números, sem espaço."),
  tipo: z.enum(["percentual", "valor", "fotos_gratis"], "Escolha o tipo."),
  valor: z.string().trim().min(1, "Informe o valor do desconto."),
  usosMax: z.preprocess(
    opcional,
    z.coerce.number().int().min(1, "Pelo menos 1 uso.").max(100_000).optional(),
  ),
  inicioEm: z.string().min(1, "Informe quando o cupom começa a valer."),
  expiraEm: z.preprocess(opcional, z.string().optional()),
  minimoTipo: z.enum(["nenhum", "valor", "quantidade"]),
  minimoValor: z.preprocess(opcional, z.string().optional()),
  todosEventos: z.enum(["sim", "nao"]),
  ativo: z.preprocess((v) => v === "on", z.boolean()),
});

/** Cria ou edita um cupom do fotógrafo logado. */
export async function salvarCupomAcao(
  _anterior: EstadoCupom,
  formulario: FormData,
): Promise<EstadoCupom> {
  const { conta } = await exigirFotografo("/painel/descontos");
  const validacao = formularioCupom.safeParse(Object.fromEntries(formulario));
  if (!validacao.success) {
    const erros: EstadoCupom["erros"] = {};
    for (const p of validacao.error.issues) erros[p.path[0] as CampoCupom] ??= p.message;
    return { erros };
  }
  const d = validacao.data;

  if (d.cupomId) {
    const meus = await listarCuponsDoFotografo(conta.id);
    if (!meus.some((c) => c.id === d.cupomId))
      return { erros: { codigo: "Cupom não encontrado." } };
  }
  if (await codigoDeCupomEmUso(d.codigo, d.cupomId)) {
    return { erros: { codigo: "Este código já está em uso. Escolha outro." } };
  }

  // O valor muda de sentido com o tipo: percentual, reais ou quantidade de fotos.
  let valor: number;
  if (d.tipo === "valor") {
    const centavos = reaisParaCentavos(d.valor);
    if (centavos === null || centavos < 100 || centavos > 100_000) {
      return { erros: { valor: "Informe um valor entre R$ 1,00 e R$ 1.000,00." } };
    }
    valor = centavos;
  } else {
    const [min, max, mensagem] =
      d.tipo === "percentual"
        ? [1, 100, "Informe um percentual de 1 a 100."]
        : [1, 50, "Informe de 1 a 50 fotos grátis."];
    valor = Number(d.valor);
    if (!Number.isInteger(valor) || valor < min || valor > max)
      return { erros: { valor: mensagem } };
  }

  const inicioEm = campoParaIso(d.inicioEm);
  if (!inicioEm) return { erros: { inicioEm: "Informe uma data válida." } };
  const expiraEm = d.expiraEm ? campoParaIso(d.expiraEm) : null;
  if (d.expiraEm && !expiraEm) return { erros: { expiraEm: "Informe uma data válida." } };
  if (expiraEm && expiraEm <= inicioEm) {
    return { erros: { expiraEm: "O fim precisa ser depois do início." } };
  }

  let minimoValor = 0;
  if (d.minimoTipo === "valor") {
    const centavos = reaisParaCentavos(d.minimoValor ?? "");
    if (centavos === null || centavos < 100) {
      return { erros: { minimoValor: "Informe o valor mínimo da compra." } };
    }
    minimoValor = centavos;
  } else if (d.minimoTipo === "quantidade") {
    minimoValor = Number(d.minimoValor);
    if (!Number.isInteger(minimoValor) || minimoValor < 2 || minimoValor > 500) {
      return { erros: { minimoValor: "Informe de 2 a 500 itens." } };
    }
  }

  // Eventos escolhidos: só os do próprio fotógrafo valem.
  const pedidos = formulario.getAll("eventoIds").filter((v): v is string => typeof v === "string");
  const eventoIds =
    d.todosEventos === "sim"
      ? []
      : await filtrarEventosDoFotografo(
          conta.id,
          pedidos.filter((id) => z.uuid().safeParse(id).success),
        );
  if (d.todosEventos === "nao" && eventoIds.length === 0) {
    return { erros: { eventoIds: "Escolha pelo menos um evento." } };
  }

  const dados: DadosCupom = {
    codigo: d.codigo,
    tipo: d.tipo,
    valor,
    usosMax: d.usosMax ?? null,
    inicioEm,
    expiraEm,
    minimoTipo: d.minimoTipo,
    minimoValor,
    todosEventos: d.todosEventos === "sim",
    eventoIds,
    ativo: d.ativo,
  };
  const salvou = await salvarCupom(conta.id, dados, d.cupomId);
  if (!salvou) return { erros: { codigo: "Cupom não encontrado." } };
  revalidatePath("/painel/descontos");
  return { ok: true };
}
