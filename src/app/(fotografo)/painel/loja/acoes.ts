"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  buscarLojaDoFotografo,
  definirDominioDaLoja,
  dominioEmUso,
  marcarDominioVerificado,
  salvarLoja,
  subdominioEmUso,
} from "@/dados";
import { enderecoDoSite } from "@/lib/endereco";
import {
  dominioProprioValido,
  FORMATO_COR,
  FORMATO_GA,
  FORMATO_GTM,
  normalizarDominio,
  subdominioValido,
} from "@/lib/loja";
import {
  conectarDominio,
  desconectarDominio,
  verificarDominio,
  type DesafioDns,
} from "@/lib/vercel";
import { exigirFotografo } from "@/servicos/sessao";

export type CampoLoja =
  "nome" | "descricao" | "subdominio" | "corPrimaria" | "corSecundaria" | "gaId" | "gtmId";
export type EstadoLoja = { ok?: boolean; erros?: Partial<Record<CampoLoja, string>> };

const opcional = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const formulario = z.object({
  nome: z.string().trim().min(2, "Dê um nome à loja.").max(80, "Até 80 caracteres."),
  descricao: z.preprocess(opcional, z.string().trim().max(300, "Até 300 caracteres.").nullable()),
  subdominio: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      subdominioValido,
      "Use de 3 a 32 letras minúsculas, números ou hífen (sem começar nem terminar com hífen).",
    ),
  corPrimaria: z.string().regex(FORMATO_COR, "Escolha uma cor."),
  corSecundaria: z.string().regex(FORMATO_COR, "Escolha uma cor."),
  // Só o ID: qualquer outra coisa (HTML, script, URL) é recusada (docs/riscos.md).
  gaId: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v),
    z.string().regex(FORMATO_GA, "Cole só o ID, no formato G-XXXXXXXXXX.").nullable(),
  ),
  gtmId: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v),
    z.string().regex(FORMATO_GTM, "Cole só o ID, no formato GTM-XXXXXXX.").nullable(),
  ),
  ativa: z.preprocess((v) => v === "on", z.boolean()),
});

/** Cria ou atualiza a loja do fotógrafo logado. */
export async function salvarLojaAcao(_anterior: EstadoLoja, dados: FormData): Promise<EstadoLoja> {
  const { conta } = await exigirFotografo("/painel/loja");
  const validacao = formulario.safeParse(Object.fromEntries(dados));
  if (!validacao.success) {
    const erros: EstadoLoja["erros"] = {};
    for (const p of validacao.error.issues) erros[p.path[0] as CampoLoja] ??= p.message;
    return { erros };
  }
  const d = validacao.data;
  if (await subdominioEmUso(d.subdominio, conta.id)) {
    return { erros: { subdominio: "Este endereço já é de outra loja. Escolha outro." } };
  }
  await salvarLoja(conta.id, d);
  revalidatePath("/painel/loja");
  revalidatePath(`/loja/${d.subdominio}`);
  return { ok: true };
}

// ---------------------------------------------------------------- Domínio próprio

export type ResultadoDominio =
  { ok: true; verificado: boolean; desafios: DesafioDns[] } | { ok: false; erro: string };

function revalidarLoja() {
  revalidatePath("/painel/loja");
}

/** Conecta um domínio do fotógrafo (ex.: fotos.liaramos.com.br) à loja dele. */
export async function conectarDominioAcao(texto: unknown): Promise<ResultadoDominio> {
  const { conta } = await exigirFotografo("/painel/loja");
  if (typeof texto !== "string" || texto.length > 300)
    return { ok: false, erro: "Domínio inválido." };
  const loja = await buscarLojaDoFotografo(conta.id);
  if (!loja) return { ok: false, erro: "Salve a loja antes de conectar um domínio." };

  const dominio = normalizarDominio(texto);
  if (!dominioProprioValido(dominio, new URL(enderecoDoSite()).hostname)) {
    return { ok: false, erro: "Informe um domínio seu, como fotos.seusite.com.br." };
  }
  if (await dominioEmUso(dominio, conta.id)) {
    return { ok: false, erro: "Este domínio já está ligado a outra loja." };
  }
  if (loja.dominioProprio === dominio) {
    return { ok: true, verificado: loja.dominioVerificado, desafios: [] };
  }

  const resultado = await conectarDominio(dominio);
  if (!resultado.ok) {
    const mensagens = {
      em_uso: "Este domínio já está em uso em outro site na Vercel.",
      invalido: "A Vercel não aceitou este domínio. Confira se ele está certo.",
      indisponivel: "Não conseguimos falar com a Vercel agora. Tente de novo em instantes.",
    };
    return { ok: false, erro: mensagens[resultado.erro] };
  }
  // Trocou de domínio: o antigo sai do projeto.
  if (loja.dominioProprio) await desconectarDominio(loja.dominioProprio);
  await definirDominioDaLoja(conta.id, dominio);
  if (resultado.situacao.verificado) await marcarDominioVerificado(conta.id, dominio, true);
  revalidarLoja();
  return { ok: true, ...resultado.situacao };
}

/** Pede à Vercel para conferir o DNS do domínio da loja. */
export async function verificarDominioAcao(): Promise<ResultadoDominio> {
  const { conta } = await exigirFotografo("/painel/loja");
  const loja = await buscarLojaDoFotografo(conta.id);
  if (!loja?.dominioProprio) return { ok: false, erro: "Conecte um domínio primeiro." };
  const situacao = await verificarDominio(loja.dominioProprio);
  if (!situacao) {
    return {
      ok: false,
      erro: "Não conseguimos falar com a Vercel agora. Tente de novo em instantes.",
    };
  }
  await marcarDominioVerificado(conta.id, loja.dominioProprio, situacao.verificado);
  revalidarLoja();
  return { ok: true, ...situacao };
}

export async function removerDominioAcao(): Promise<ResultadoDominio> {
  const { conta } = await exigirFotografo("/painel/loja");
  const loja = await buscarLojaDoFotografo(conta.id);
  if (!loja?.dominioProprio) return { ok: true, verificado: false, desafios: [] };
  if (!(await desconectarDominio(loja.dominioProprio))) {
    return {
      ok: false,
      erro: "Não conseguimos falar com a Vercel agora. Tente de novo em instantes.",
    };
  }
  await definirDominioDaLoja(conta.id, null);
  revalidarLoja();
  return { ok: true, verificado: false, desafios: [] };
}
