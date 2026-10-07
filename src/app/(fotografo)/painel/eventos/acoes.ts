"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adicionarItensSimulados,
  atualizarEvento,
  buscarEventoDoFotografo,
  criarEvento,
  definirSenhaDoEvento,
  excluirItem,
  listarCategorias,
  mudarStatusDoEvento,
  slugDeEventoEmUso,
  temContaDeRecebimento,
  type DadosDoEvento,
} from "@/dados";
import { campoParaIso } from "@/lib/datas";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { gerarHashSenha } from "@/lib/senha";
import { gerarSlug } from "@/lib/slug";
import { UFS } from "@/lib/ufs";
import { exigirFotografo } from "@/servicos/sessao";

export type CampoEvento =
  | "titulo"
  | "categoriaId"
  | "inicioEm"
  | "fimEm"
  | "local"
  | "cidade"
  | "estado"
  | "precoFoto"
  | "precoVideo"
  | "visibilidade"
  | "senha"
  | "liberacao"
  | "liberadoEm"
  | "ordenacao";

export type EstadoEvento = { ok?: boolean; erros?: Partial<Record<CampoEvento, string>> };

const texto = (mensagem: string, min: number, max: number) =>
  z.string(mensagem).trim().min(min, mensagem).max(max, `Até ${max} caracteres.`);

const data = (mensagem: string) =>
  z.string(mensagem).transform((v, ctx) => {
    const iso = campoParaIso(v);
    if (!iso) ctx.addIssue({ code: "custom", message: mensagem });
    return iso ?? "";
  });

const preco = (mensagem: string) =>
  z.string(mensagem).transform((v, ctx) => {
    const centavos = reaisParaCentavos(v);
    if (centavos === null || centavos < 100 || centavos > 100_000) {
      ctx.addIssue({ code: "custom", message: mensagem });
    }
    return centavos ?? 0;
  });

const marcado = z.preprocess((v) => v === "on", z.boolean());

const formulario = z
  .object({
    titulo: texto("Informe o nome do evento.", 3, 120),
    categoriaId: z.uuid("Escolha a categoria."),
    inicioEm: data("Informe a data e a hora de início."),
    fimEm: data("Informe a data e a hora de fim."),
    local: texto("Informe o local.", 2, 120),
    cidade: texto("Informe a cidade.", 2, 80),
    estado: z.enum(UFS, "Escolha o estado."),
    precoFoto: preco("Informe um preço entre R$ 1,00 e R$ 1.000,00."),
    precoVideo: preco("Informe um preço entre R$ 1,00 e R$ 1.000,00."),
    visibilidade: z.enum(["publico", "nao_listado", "senha"], "Escolha a visibilidade."),
    senha: z.string().max(50, "Até 50 caracteres.").optional(),
    fotosSoAposBusca: marcado,
    liberacao: z.enum(["automatica", "manual", "agendada"], "Escolha a liberação."),
    liberadoEm: z.string().optional(),
    filtroHorario: marcado,
    listarNaoIdentificadas: marcado,
    ordenacao: z.enum(["envio", "captura", "nome_arquivo", "aleatoria"], "Escolha a ordem."),
  })
  .refine((d) => !d.inicioEm || !d.fimEm || d.fimEm >= d.inicioEm, {
    path: ["fimEm"],
    message: "O fim precisa ser depois do início.",
  });

function errosDe(issues: z.core.$ZodIssue[]) {
  const erros: EstadoEvento["erros"] = {};
  for (const problema of issues) erros[problema.path[0] as CampoEvento] ??= problema.message;
  return erros;
}

/** Cria (sem `eventoId`) ou atualiza um evento do fotógrafo logado. */
export async function salvarEventoAcao(
  _anterior: EstadoEvento,
  dadosFormulario: FormData,
): Promise<EstadoEvento> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const eventoId = dadosFormulario.get("eventoId");
  const existente =
    typeof eventoId === "string" && eventoId
      ? await buscarEventoDoFotografo(eventoId, conta.id)
      : null;
  if (eventoId && !existente) return { erros: { titulo: "Evento não encontrado." } };

  const validacao = formulario.safeParse(Object.fromEntries(dadosFormulario));
  if (!validacao.success) return { erros: errosDe(validacao.error.issues) };
  const d = validacao.data;

  if (!(await listarCategorias()).some((c) => c.id === d.categoriaId)) {
    return { erros: { categoriaId: "Escolha a categoria." } };
  }

  // Senha: obrigatória ao ligar a proteção; em branco mantém a atual.
  const senha = d.senha?.trim() ?? "";
  if (d.visibilidade === "senha" && !senha && !existente?.temSenha) {
    return { erros: { senha: "Defina a senha do evento." } };
  }
  if (senha && senha.length < 4) return { erros: { senha: "Use pelo menos 4 caracteres." } };

  let liberadoEm: string | null = null;
  if (d.liberacao === "agendada") {
    liberadoEm = d.liberadoEm ? campoParaIso(d.liberadoEm) : null;
    if (!liberadoEm) return { erros: { liberadoEm: "Informe quando as fotos serão liberadas." } };
  } else if (d.liberacao === "manual") {
    // Manual: continua como estava até o fotógrafo clicar em "Liberar agora".
    liberadoEm = existente?.liberacao === "manual" ? existente.liberadoEm : null;
  }

  const dados: Omit<DadosDoEvento, "slug"> = {
    titulo: d.titulo,
    categoriaId: d.categoriaId,
    inicioEm: d.inicioEm,
    fimEm: d.fimEm,
    local: d.local,
    cidade: d.cidade,
    estado: d.estado,
    precoFotoCentavos: d.precoFoto,
    precoVideoCentavos: d.precoVideo,
    visibilidade: d.visibilidade,
    listado: d.visibilidade !== "nao_listado",
    fotosSoAposBusca: d.fotosSoAposBusca,
    liberacao: d.liberacao,
    liberadoEm,
    filtroHorario: d.filtroHorario,
    listarNaoIdentificadas: d.listarNaoIdentificadas,
    ordenacao: d.ordenacao,
  };

  let id: string;
  if (existente) {
    await atualizarEvento(existente.id, conta.id, dados);
    id = existente.id;
  } else {
    const evento = await criarEvento(conta.id, { ...dados, slug: await slugDisponivel(d) });
    id = evento.id;
  }
  if (d.visibilidade !== "senha") await definirSenhaDoEvento(id, conta.id, null);
  else if (senha) await definirSenhaDoEvento(id, conta.id, gerarHashSenha(senha));

  revalidatePath("/painel/eventos");
  if (!existente) redirect(`/painel/eventos/${id}?criado=1`);
  return { ok: true };
}

/** Endereço público: nome do evento + ano, com sufixo se já existir. Não muda depois. */
async function slugDisponivel(d: { titulo: string; inicioEm: string }) {
  const ano = d.inicioEm.slice(0, 4);
  const base = gerarSlug(d.titulo.includes(ano) ? d.titulo : `${d.titulo} ${ano}`) || "evento";
  let slug = base;
  for (let n = 2; await slugDeEventoEmUso(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const idEvento = z.uuid();

/**
 * Publica um evento em rascunho ou arquivado. Exige chave Pix confirmada: sem ela, o fotógrafo
 * não teria como sacar o que vender (docs/riscos.md, fotógrafo sem chave Pix confirmada).
 */
export async function publicarEventoAcao(eventoId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  if (!(await temContaDeRecebimento(conta.id))) {
    return { erro: "Confirme sua chave Pix em Perfil e recebimento antes de publicar." };
  }
  const publicou =
    (await mudarStatusDoEvento(eventoId, conta.id, "rascunho", "publicado")) ||
    (await mudarStatusDoEvento(eventoId, conta.id, "arquivado", "publicado"));
  if (!publicou) return { erro: "Este evento não pode ser publicado agora." };
  revalidatePath("/painel/eventos");
  revalidatePath(`/painel/eventos/${eventoId}`);
  return {};
}

/** Tira do ar: publicado vira arquivado (some das listas, mas quem comprou continua baixando). */
export async function arquivarEventoAcao(eventoId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const arquivou = await mudarStatusDoEvento(eventoId, conta.id, "publicado", "arquivado");
  if (!arquivou) return { erro: "Não foi possível arquivar este evento." };
  revalidatePath("/painel/eventos");
  revalidatePath(`/painel/eventos/${eventoId}`);
  return {};
}

/** Libera agora as fotos de um evento com liberação manual. */
export async function liberarAgoraAcao(eventoId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const evento = await buscarEventoDoFotografo(eventoId, conta.id);
  if (!evento || evento.liberacao !== "manual")
    return { erro: "Este evento não usa liberação manual." };
  await atualizarEvento(eventoId, conta.id, { liberadoEm: new Date().toISOString() });
  revalidatePath(`/painel/eventos/${eventoId}`);
  return {};
}

const LIMITE_FOTO_BYTES = 30 * 1024 * 1024;
const MAXIMO_POR_ENVIO = 500;

const arquivos = z
  .array(
    z.object({
      nome: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/\.jpe?g$/i, "Só arquivos JPEG."),
      tamanhoBytes: z.number().int().positive().max(LIMITE_FOTO_BYTES, "Até 30 MB por foto."),
    }),
  )
  .min(1)
  .max(MAXIMO_POR_ENVIO);

/**
 * Envio simulado (Parte A): recebe só nome e tamanho dos arquivos já conferidos no navegador e
 * cria os itens com imagens de exemplo. Na Fase 12 o arquivo vai direto ao R2 por URL assinada
 * e o job confere o tipo real pelo conteúdo (docs/arquitetura.md, "Upload").
 */
export async function enviarFotosAcao(
  eventoId: string,
  lista: unknown,
): Promise<{ erro?: string; enviados?: number }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const dados = arquivos.safeParse(lista);
  if (!dados.success) {
    return { erro: `Envie de 1 a ${MAXIMO_POR_ENVIO} fotos JPEG de até 30 MB cada.` };
  }
  const criados = await adicionarItensSimulados(eventoId, conta.id, dados.data);
  if (!criados) return { erro: "Evento não encontrado." };
  revalidatePath(`/painel/eventos/${eventoId}`);
  revalidatePath("/painel/colaboracoes");
  return { enviados: criados.length };
}

/** Exclusão lógica de um item de evento do fotógrafo logado. */
export async function excluirItemAcao(fotoId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!idEvento.safeParse(fotoId).success) return { erro: "Foto não encontrada." };
  const excluiu = await excluirItem(fotoId, conta.id);
  if (!excluiu) return { erro: "Foto não encontrada." };
  revalidatePath("/painel/eventos", "layout");
  return {};
}
