"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adicionarItensSimulados,
  atualizarEvento,
  buscarEventoDoFotografo,
  configDoEvento,
  copiarDescontosDoEvento,
  criarEvento,
  definirSenhaDoEvento,
  excluirItem,
  excluirModelo,
  hashesDoEvento,
  listarCategorias,
  mudarStatusDoEvento,
  registrarHashes,
  salvarModeloDoEvento,
  slugDeEventoEmUso,
  type DadosDoEvento,
} from "@/dados";
import { campoParaIso } from "@/lib/datas";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { ERRO_SEM_ARMAZENAMENTO, modoEnvio } from "@/lib/r2";
import { gerarHashSenha } from "@/lib/senha";
import { gerarSlug } from "@/lib/slug";
import { UFS } from "@/lib/ufs";
import { confirmarEnvio, iniciarEnvio, type ItemDoEnvio } from "@/servicos/envios";
import { MENSAGEM_PENDENCIA_RECEBIMENTO, pendenciaDeRecebimento } from "@/servicos/saques";
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
 * Publica um evento em rascunho ou arquivado. Exige chave Pix confirmada (o próprio CPF/CNPJ):
 * sem ela, o fotógrafo não teria como sacar o que vender (docs/riscos.md, fotógrafo sem chave
 * Pix confirmada). O erro diz exatamente o que falta e leva ao perfil.
 */
export async function publicarEventoAcao(
  eventoId: string,
): Promise<{ erro?: string; irParaPerfil?: boolean }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const pendencia = pendenciaDeRecebimento(conta);
  if (pendencia) {
    return { erro: MENSAGEM_PENDENCIA_RECEBIMENTO[pendencia], irParaPerfil: true };
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
      /** SHA-256 do arquivo, calculado no navegador: acha a mesma foto enviada duas vezes. */
      hash: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .optional(),
    }),
  )
  .min(1)
  .max(MAXIMO_POR_ENVIO);

/**
 * Envio simulado (só fora da produção e sem o R2 configurado): recebe só nome e tamanho dos
 * arquivos já conferidos no navegador e cria os itens com imagens de exemplo. Com o R2, o
 * painel usa iniciarEnvioAcao e confirmarEnvioAcao (docs/arquitetura.md, "Upload").
 */
export async function enviarFotosAcao(
  eventoId: string,
  lista: unknown,
): Promise<{ erro?: string; enviados?: number; repetidas?: number }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const modo = modoEnvio();
  if (modo === "indisponivel") return { erro: ERRO_SEM_ARMAZENAMENTO };
  if (modo === "r2") return { erro: "Atualize a página para enviar as fotos." };
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const dados = arquivos.safeParse(lista);
  if (!dados.success) {
    return { erro: `Envie de 1 a ${MAXIMO_POR_ENVIO} fotos JPEG de até 30 MB cada.` };
  }

  // Foto repetida (mesmo arquivo já no evento, ou duas vezes no mesmo envio) não entra de novo.
  const jaNoEvento = await hashesDoEvento(eventoId);
  const vistos = new Set<string>();
  const novos = dados.data.filter((a) => {
    if (!a.hash) return true;
    if (jaNoEvento.has(a.hash) || vistos.has(a.hash)) return false;
    vistos.add(a.hash);
    return true;
  });
  const repetidas = dados.data.length - novos.length;
  if (novos.length === 0) return { enviados: 0, repetidas };

  const criados = await adicionarItensSimulados(eventoId, conta.id, novos);
  if (!criados) return { erro: "Evento não encontrado." };
  await registrarHashes(
    eventoId,
    criados.flatMap((foto, i) => {
      const hash = novos[i].hash;
      return hash ? [{ hash, fotoId: foto.id }] : [];
    }),
  );
  revalidatePath(`/painel/eventos/${eventoId}`);
  revalidatePath("/painel/colaboracoes");
  return { enviados: criados.length, repetidas };
}

/**
 * Envio real, passo 1: registra um lote de até 25 fotos em `processando` e devolve as URLs
 * assinadas para o navegador mandar cada JPEG direto ao R2 (o arquivo não passa por aqui).
 */
export async function iniciarEnvioAcao(
  eventoId: string,
  lista: unknown,
): Promise<{ erro: string } | { itens: ItemDoEnvio[] }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  return iniciarEnvio(conta.id, eventoId, lista);
}

/**
 * Envio real, passo 2: depois que o navegador terminou o PUT de uma foto, confere o arquivo,
 * gera prévia e miniatura e marca a foto `pronta` (ou `erro`). Uma foto por chamada, para
 * caber no tempo da função (maxDuration nas páginas que enviam).
 */
export async function confirmarEnvioAcao(fotoId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const resultado = await confirmarEnvio(conta.id, fotoId);
  return "erro" in resultado ? { erro: resultado.erro } : {};
}

// ---------------------------------------------------------------- Reaproveitar configuração

/**
 * Cria um evento novo, em rascunho, com a mesma configuração, os mesmos descontos e o mesmo
 * pacote do evento de origem. Fotos, senha e vendas não vão junto. Abre o novo para ajustar
 * nome e datas.
 */
export async function duplicarEventoAcao(eventoId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const origem = await buscarEventoDoFotografo(eventoId, conta.id);
  if (!origem) return { erro: "Evento não encontrado." };

  const titulo = `${origem.titulo} (cópia)`.slice(0, 120);
  const config = configDoEvento(origem);
  const evento = await criarEvento(conta.id, {
    ...config,
    titulo,
    inicioEm: origem.inicioEm,
    fimEm: origem.fimEm,
    listado: config.visibilidade !== "nao_listado",
    liberadoEm: null,
    slug: await slugDisponivel({ titulo, inicioEm: origem.inicioEm }),
  });
  await copiarDescontosDoEvento(origem.id, evento.id, conta.id);
  revalidatePath("/painel/eventos");
  redirect(`/painel/eventos/${evento.id}?copiado=1`);
}

const nomeModelo = z.string().trim().min(2).max(60);

/** Guarda a configuração do evento como modelo, para começar os próximos com ela. */
export async function salvarModeloAcao(
  eventoId: string,
  nome: string,
): Promise<{ erro?: string; ok?: boolean }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const dados = nomeModelo.safeParse(nome);
  if (!idEvento.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  if (!dados.success) return { erro: "Dê um nome de 2 a 60 caracteres ao modelo." };
  const modelo = await salvarModeloDoEvento(eventoId, conta.id, dados.data);
  if (!modelo) return { erro: "Evento não encontrado." };
  revalidatePath("/painel/eventos/novo");
  return { ok: true };
}

export async function excluirModeloAcao(modeloId: string): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos/novo");
  if (!idEvento.safeParse(modeloId).success) return { erro: "Modelo não encontrado." };
  if (!(await excluirModelo(modeloId, conta.id))) return { erro: "Modelo não encontrado." };
  revalidatePath("/painel/eventos/novo");
  return {};
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
