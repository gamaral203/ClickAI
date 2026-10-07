"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { atualizarContaDoFotografo, slugDeFotografoEmUso } from "@/dados";
import { cpfOuCnpjValido, somenteDigitos } from "@/lib/documentos";
import { FORMATO_SLUG } from "@/lib/slug";
import { exigirFotografo } from "@/servicos/sessao";

export type CampoPerfil = "nomePublico" | "slug" | "bio" | "instagram" | "site" | "cpfCnpj";
export type EstadoPerfil = {
  ok?: boolean;
  erros?: Partial<Record<CampoPerfil, string>>;
};

const vazioParaNulo = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const perfil = z.object({
  nomePublico: z.string("Informe o nome público.").trim().min(2, "Informe o nome público.").max(80),
  slug: z
    .string("Informe o endereço do perfil.")
    .trim()
    .toLowerCase()
    .regex(FORMATO_SLUG, "Use só letras minúsculas sem acento, números e hífens."),
  bio: z.preprocess(vazioParaNulo, z.string().trim().max(500, "Até 500 caracteres.").nullish()),
  instagram: z.preprocess(
    (v) => vazioParaNulo(typeof v === "string" ? v.trim().replace(/^@/, "") : v),
    z
      .string()
      .regex(/^[A-Za-z0-9._]{1,30}$/, "Informe só o usuário do Instagram, sem o @.")
      .nullish(),
  ),
  // Só http(s): impede links javascript: no perfil público.
  site: z.preprocess(
    vazioParaNulo,
    z
      .url({ protocol: /^https?$/, error: "Informe um endereço começando com https://" })
      .max(200)
      .nullish(),
  ),
  cpfCnpj: z.preprocess(
    vazioParaNulo,
    z
      .string()
      .refine(cpfOuCnpjValido, "CPF ou CNPJ inválido. Confira os números.")
      .transform(somenteDigitos)
      .nullish(),
  ),
});

export async function salvarPerfilAcao(
  _anterior: EstadoPerfil,
  formulario: FormData,
): Promise<EstadoPerfil> {
  const { usuario, conta } = await exigirFotografo("/painel/perfil");
  const dados = perfil.safeParse(Object.fromEntries(formulario));
  if (!dados.success) {
    const erros: EstadoPerfil["erros"] = {};
    for (const problema of dados.error.issues) {
      const campo = problema.path[0] as CampoPerfil;
      erros[campo] ??= problema.message;
    }
    return { erros };
  }
  if (await slugDeFotografoEmUso(dados.data.slug, conta.id)) {
    return { erros: { slug: "Este endereço já é usado por outro fotógrafo." } };
  }

  const { instagram, site, cpfCnpj, ...resto } = dados.data;
  await atualizarContaDoFotografo(usuario.id, {
    ...resto,
    redesSociais: { ...(instagram && { instagram }), ...(site && { site }) },
    cpfCnpj: cpfCnpj ?? "",
  });
  revalidatePath("/painel", "layout");
  return { ok: true };
}

/**
 * Conta de recebimento simulada. Na Fase 13 vira o cadastro da subconta no gateway (com os
 * dados bancários coletados pelo próprio gateway, nunca por nós).
 */
export async function conectarContaRecebimentoAcao() {
  const { usuario, conta } = await exigirFotografo("/painel/perfil");
  if (!conta.cpfCnpj) return;
  await atualizarContaDoFotografo(usuario.id, { contaRecebimentoId: `simulada-${randomUUID()}` });
  revalidatePath("/painel", "layout");
}

const repasse = z
  .object({
    frequenciaRepasse: z.enum(["diaria", "semanal", "mensal"], "Escolha a frequência."),
    diaSemana: z.coerce.number().int().min(1).max(5).optional(),
    diaMes: z.coerce.number().int().min(1).max(28).optional(),
  })
  .transform((d) => ({
    frequenciaRepasse: d.frequenciaRepasse,
    diaRepasse:
      d.frequenciaRepasse === "semanal"
        ? (d.diaSemana ?? 5)
        : d.frequenciaRepasse === "mensal"
          ? (d.diaMes ?? 1)
          : null,
  }));

export type EstadoRepasse = { ok?: boolean; erro?: string };

/**
 * Frequência do repasse: diário, semanal (dia útil 1–5, segunda a sexta) ou mensal (dia
 * 1–28, para existir em todo mês). O repasse automático roda na Fase 13.
 */
export async function salvarRepasseAcao(
  _anterior: EstadoRepasse,
  formulario: FormData,
): Promise<EstadoRepasse> {
  const { usuario } = await exigirFotografo("/painel/perfil");
  const dados = repasse.safeParse(Object.fromEntries(formulario));
  if (!dados.success) return { erro: "Escolha a frequência e o dia do repasse." };
  await atualizarContaDoFotografo(usuario.id, dados.data);
  revalidatePath("/painel", "layout");
  return { ok: true };
}
