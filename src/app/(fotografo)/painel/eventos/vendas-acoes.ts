"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  adicionarColaborador,
  atualizarColaborador,
  buscarEventoDoFotografo,
  buscarFotografoPorEmail,
  definirPrecoDoItem,
  removerColaborador,
  salvarPacote,
} from "@/dados";
import { campoParaIso } from "@/lib/datas";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";
import { exigirFotografo } from "@/servicos/sessao";

// Recursos de venda de um evento no painel: pacote, preço individual e colaboradores. Server
// Actions são públicas: tudo é validado aqui e a camada de dados confere o dono.

const id = z.uuid();
const opcional = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

// ---------------------------------------------------------------- Pacote

export type CampoPacote = "precoCentavos" | "mostrarAPartirDe" | "expiraEm";
export type EstadoPacote = { ok?: boolean; erros?: Partial<Record<CampoPacote, string>> };

const formularioPacote = z.object({
  eventoId: id,
  ativo: z.preprocess((v) => v === "on", z.boolean()),
  tipoPreco: z.enum(["fixo", "por_foto"]),
  preco: z.string(),
  mostrarAPartirDe: z.preprocess(
    opcional,
    z.coerce.number().int().min(2, "A partir de 2 fotos.").max(500, "Até 500 fotos.").optional(),
  ),
  expiraEm: z.preprocess(opcional, z.string().optional()),
});

export async function salvarPacoteAcao(
  _anterior: EstadoPacote,
  formulario: FormData,
): Promise<EstadoPacote> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const validacao = formularioPacote.safeParse(Object.fromEntries(formulario));
  if (!validacao.success) {
    const erros: EstadoPacote["erros"] = {};
    for (const p of validacao.error.issues) {
      const campo = p.path[0] === "preco" ? "precoCentavos" : (p.path[0] as CampoPacote);
      erros[campo] ??= p.message;
    }
    return { erros };
  }
  const d = validacao.data;
  const evento = await buscarEventoDoFotografo(d.eventoId, conta.id);
  if (!evento) return { erros: { precoCentavos: "Evento não encontrado." } };

  const preco = reaisParaCentavos(d.preco);
  // Por foto, o pacote precisa sair mais barato que a foto avulsa; senão não é desconto.
  const teto = d.tipoPreco === "por_foto" ? evento.precoFotoCentavos - 1 : 1_000_000;
  if (preco === null || preco < 100 || preco > teto) {
    return {
      erros: {
        precoCentavos:
          d.tipoPreco === "por_foto"
            ? "O preço por foto do pacote precisa ser menor que o da foto avulsa."
            : "Informe um preço entre R$ 1,00 e R$ 10.000,00.",
      },
    };
  }
  const expiraEm = d.expiraEm ? campoParaIso(d.expiraEm) : null;
  if (d.expiraEm && !expiraEm) return { erros: { expiraEm: "Informe uma data válida." } };

  await salvarPacote(evento.id, conta.id, {
    ativo: d.ativo,
    tipoPreco: d.tipoPreco,
    precoCentavos: preco,
    mostrarAPartirDe: d.mostrarAPartirDe ?? null,
    expiraEm,
  });
  revalidatePath(`/painel/eventos/${evento.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Preço individual

/** Preço próprio de um item (texto em reais), ou vazio para voltar ao preço do evento. */
export async function definirPrecoAcao(fotoId: string, texto: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const preco = z.string().max(20).safeParse(texto);
  if (!id.safeParse(fotoId).success || !preco.success) {
    return { erro: "Foto não encontrada." };
  }
  texto = preco.data;
  let centavos: number | null = null;
  if (texto.trim() !== "") {
    centavos = reaisParaCentavos(texto);
    if (centavos === null || centavos < 100 || centavos > 100_000) {
      return { erro: "Informe um preço entre R$ 1,00 e R$ 1.000,00." };
    }
  }
  if (!(await definirPrecoDoItem(fotoId, conta.id, centavos))) {
    return { erro: "Foto não encontrada." };
  }
  revalidatePath("/painel/eventos", "layout");
  return {};
}

// ---------------------------------------------------------------- Colaboradores

const comissao = z.coerce
  .number("Informe a comissão.")
  .int("Use um número inteiro.")
  .min(0, "De 0% a 90%.")
  .max(90, "De 0% a 90%.");
const nota = z
  .string()
  .trim()
  .max(200, "Até 200 caracteres.")
  .transform((v) => (v === "" ? null : v));

export type CampoColaborador = "email" | "comissaoDonoPct" | "nota";
export type EstadoColaborador = {
  ok?: boolean;
  erros?: Partial<Record<CampoColaborador, string>>;
};

const convite = z.object({
  eventoId: id,
  email: z.email("Informe o e-mail da conta do fotógrafo.").max(254),
  comissaoDonoPct: comissao,
  nota,
});

/**
 * Adiciona como colaborador um fotógrafo que já tem conta, pelo e-mail dela. O convite por
 * e-mail para quem ainda não tem conta entra com o envio de e-mails (Fase 13).
 */
export async function convidarColaboradorAcao(
  _anterior: EstadoColaborador,
  formulario: FormData,
): Promise<EstadoColaborador> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const validacao = convite.safeParse(Object.fromEntries(formulario));
  if (!validacao.success) {
    const erros: EstadoColaborador["erros"] = {};
    for (const p of validacao.error.issues) {
      if (p.path[0] !== "eventoId") erros[p.path[0] as CampoColaborador] ??= p.message;
    }
    return { erros };
  }
  const d = validacao.data;
  const fotografo = await buscarFotografoPorEmail(d.email);
  if (!fotografo) {
    return {
      erros: {
        email: "Não achamos um fotógrafo com este e-mail. Peça para ele criar a conta de vendedor.",
      },
    };
  }
  const resultado = await adicionarColaborador(d.eventoId, conta.id, {
    fotografoId: fotografo.id,
    comissaoDonoPct: d.comissaoDonoPct,
    nota: d.nota,
  });
  const mensagens = {
    evento: "Evento não encontrado.",
    dono: "Você já é o dono deste evento.",
    ja_colabora: `${fotografo.nomePublico} já colabora neste evento.`,
  } as const;
  if (resultado !== "ok") return { erros: { email: mensagens[resultado] } };
  // Aviso por e-mail; sem o Resend configurado, o convite aparece só no painel dele.
  await enviarEmail({
    para: d.email.trim().toLowerCase(),
    assunto: `${conta.nomePublico} convidou você para um evento no ClicouAí`,
    paragrafos: [
      `${conta.nomePublico} quer que você envie fotos para um evento no ClicouAí. Cada foto fica no seu nome, e você recebe pelas fotos que vender.`,
      `A comissão de ${conta.nomePublico} é de ${d.comissaoDonoPct}% sobre o que sobrar de cada venda das suas fotos, depois da taxa da plataforma. Você só envia fotos depois de aceitar.`,
    ],
    botao: { texto: "Ver o convite", url: urlDoSite("/painel/colaboracoes") },
  }).catch(() => false);
  revalidatePath(`/painel/eventos/${d.eventoId}`);
  return { ok: true };
}

export async function atualizarColaboradorAcao(
  colaboradorId: string,
  dados: unknown,
): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const validacao = z.object({ comissaoDonoPct: comissao, nota }).safeParse(dados);
  if (!id.safeParse(colaboradorId).success) return { erro: "Colaborador não encontrado." };
  if (!validacao.success) return { erro: validacao.error.issues[0]?.message };
  const resultado = await atualizarColaborador(colaboradorId, conta.id, validacao.data);
  if (resultado === "comissao_aceita") {
    return {
      erro: "Ele já aceitou esta comissão, que vale para as fotos dele neste evento. Só a nota pode mudar.",
    };
  }
  if (resultado !== "ok") return { erro: "Colaborador não encontrado." };
  revalidatePath("/painel/eventos", "layout");
  return {};
}

export async function removerColaboradorAcao(colaboradorId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!id.safeParse(colaboradorId).success) return { erro: "Colaborador não encontrado." };
  const resultado = await removerColaborador(colaboradorId, conta.id);
  if (resultado === "tem_fotos") {
    return {
      erro: "Ele ainda tem fotos neste evento. Exclua as fotos dele antes de remover.",
    };
  }
  if (resultado !== "ok") return { erro: "Colaborador não encontrado." };
  revalidatePath("/painel/eventos", "layout");
  return {};
}
