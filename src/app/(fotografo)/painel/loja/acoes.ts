"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { salvarLoja, subdominioEmUso } from "@/dados";
import { FORMATO_COR, FORMATO_GA, FORMATO_GTM, subdominioValido } from "@/lib/loja";
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
