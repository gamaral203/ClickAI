"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";

import {
  buscarLojaDoFotografo,
  definirDominioDaLoja,
  definirImagemDoFotografo,
  dominioEmUso,
  marcarDominioVerificado,
  salvarLoja,
  subdominioEmUso,
} from "@/dados";
import { enderecoDoSite } from "@/lib/endereco";
import { ERRO_SEM_ARMAZENAMENTO, gravarPublico, modoEnvio } from "@/lib/r2";
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
/** Texto do domínio digitado (a forma exata é conferida por dominioProprioValido). */
const textoDominio = z.string().trim().min(1).max(300);

export async function conectarDominioAcao(texto: unknown): Promise<ResultadoDominio> {
  const { conta } = await exigirFotografo("/painel/loja");
  const entrada = textoDominio.safeParse(texto);
  if (!entrada.success) return { ok: false, erro: "Domínio inválido." };
  const loja = await buscarLojaDoFotografo(conta.id);
  if (!loja) return { ok: false, erro: "Salve a loja antes de conectar um domínio." };

  const dominio = normalizarDominio(entrada.data);
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

// ---------------------------------------------------------------- Banner e logo

const campoImagem = z.enum(["capa", "fotoPerfil"]);
export type ImagemDaLoja = z.infer<typeof campoImagem>;
export type ResultadoImagem = { ok: true } | { ok: false; erro: string };

/** O navegador já reduz a imagem antes de enviar; isto é só o teto (Server Action: até 1 MB). */
const LIMITE_IMAGEM_BYTES = 950 * 1024;
const MEDIDAS: Record<ImagemDaLoja, { largura: number; altura: number; fit: "inside" | "cover" }> =
  {
    capa: { largura: 1920, altura: 1080, fit: "inside" },
    fotoPerfil: { largura: 400, altura: 400, fit: "cover" },
  };

/**
 * Troca o banner (capa) ou o logo da página pública do fotógrafo. A imagem é decodificada e
 * regravada pelo sharp (nada do arquivo original passa adiante, nem metadados) e vai para o
 * bucket público do R2. Sem R2, só fora da produção, fica no banco como data URL.
 */
export async function enviarImagemDaLojaAcao(
  campo: unknown,
  dados: FormData,
): Promise<ResultadoImagem> {
  const { conta } = await exigirFotografo("/painel/loja");
  const qual = campoImagem.safeParse(campo);
  if (!qual.success) return { ok: false, erro: "Imagem inválida." };
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha uma imagem." };
  }
  if (arquivo.size > LIMITE_IMAGEM_BYTES) {
    return { ok: false, erro: "Imagem grande demais. Use uma de até 1 MB." };
  }
  const modo = modoEnvio();
  if (modo === "indisponivel") return { ok: false, erro: ERRO_SEM_ARMAZENAMENTO };

  let webp: Buffer;
  try {
    const { largura, altura, fit } = MEDIDAS[qual.data];
    webp = await sharp(Buffer.from(await arquivo.arrayBuffer()), { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(largura, altura, { fit, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, erro: "Não conseguimos ler esta imagem. Envie um JPEG ou PNG." };
  }

  let valor: string;
  if (modo === "r2") {
    valor = `perfis/${conta.id}/${qual.data === "capa" ? "banner" : "logo"}-${randomUUID()}.webp`;
    await gravarPublico(valor, webp, "image/webp");
  } else {
    valor = `data:image/webp;base64,${webp.toString("base64")}`;
  }
  await definirImagemDoFotografo(conta.id, qual.data, valor);
  revalidarPaginasPublicas(conta.slug);
  return { ok: true };
}

export async function removerImagemDaLojaAcao(campo: unknown): Promise<ResultadoImagem> {
  const { conta } = await exigirFotografo("/painel/loja");
  const qual = campoImagem.safeParse(campo);
  if (!qual.success) return { ok: false, erro: "Imagem inválida." };
  await definirImagemDoFotografo(conta.id, qual.data, null);
  revalidarPaginasPublicas(conta.slug);
  return { ok: true };
}

function revalidarPaginasPublicas(slug: string) {
  revalidatePath("/painel/loja");
  // A foto de perfil também aparece no cabeçalho do painel e em Perfil e recebimento.
  revalidatePath("/painel", "layout");
  revalidatePath(`/fotografo/${slug}`);
}
