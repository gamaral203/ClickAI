"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { atualizarContaDoFotografo, slugDeFotografoEmUso } from "@/dados";
import { cpfOuCnpjValido, somenteDigitos } from "@/lib/documentos";
import { FORMATO_SLUG } from "@/lib/slug";
import { exigirFotografo } from "@/servicos/sessao";

export type CampoPerfil = "nomePublico" | "slug" | "bio" | "instagram" | "site" | "cpfCnpj";
export type EstadoPerfil = {
  ok?: boolean;
  /** CPF/CNPJ salvo, mas a chave Pix ainda não foi confirmada (sem ela não dá para publicar). */
  chavePendente?: boolean;
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
  const novoDocumento = cpfCnpj ?? "";
  const documentoMudou = somenteDigitos(conta.cpfCnpj) !== novoDocumento;
  await atualizarContaDoFotografo(usuario.id, {
    ...resto,
    redesSociais: { ...(instagram && { instagram }), ...(site && { site }) },
    cpfCnpj: novoDocumento,
    // CPF/CNPJ mudou: a chave Pix confirmada era o documento antigo e precisa ser confirmada
    // de novo, para o saque nunca ir para uma chave que não é mais do fotógrafo.
    ...(documentoMudou && { chavePix: null }),
  });
  revalidatePath("/painel", "layout");
  return { ok: true, chavePendente: Boolean(novoDocumento) && (documentoMudou || !conta.chavePix) };
}

/**
 * Confirma a chave Pix de saque: é sempre o próprio CPF/CNPJ do cadastro, nunca uma chave
 * digitada. Assim, mesmo quem invadir a conta não consegue mandar o saque para outra pessoa
 * (docs/riscos.md). O Mercado Pago recusa o Pix se a chave não existir.
 */
export async function confirmarChavePixAcao() {
  const { usuario, conta } = await exigirFotografo("/painel/perfil");
  const documento = somenteDigitos(conta.cpfCnpj);
  if (!cpfOuCnpjValido(documento)) return;
  await atualizarContaDoFotografo(usuario.id, { chavePix: documento });
  revalidatePath("/painel", "layout");
}
