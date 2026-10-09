"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { atualizarContaDoFotografo, slugDeFotografoEmUso } from "@/dados";
import { cpfOuCnpjValido, somenteDigitos } from "@/lib/documentos";
import { FORMATO_SLUG } from "@/lib/slug";
import { BLOQUEIO_SAQUE_APOS_TROCA_MS } from "@/servicos/saques";
import { exigirFotografo, sessaoAtual } from "@/servicos/sessao";
import { confirmarIdentidade, trocarDocumento } from "@/servicos/troca-documento";

const ERRO_SENHA = "Senha incorreta. Para trocar o CPF/CNPJ, digite a senha atual da sua conta.";

export type CampoPerfil = "nomePublico" | "slug" | "bio" | "instagram" | "site" | "cpfCnpj";
/** Campos do formulário com erro possível: os do perfil e a senha da troca do CPF/CNPJ. */
export type CampoComErro = CampoPerfil | "senhaAtual";
export type EstadoPerfil = {
  ok?: boolean;
  /** CPF/CNPJ salvo, mas a chave Pix ainda não foi confirmada (sem ela não dá para publicar). */
  chavePendente?: boolean;
  /** O CPF/CNPJ foi trocado agora: saques bloqueados por 72 horas (ISO). */
  saquesLiberadosEm?: string;
  /** Conta só com o Google: precisa entrar de novo com ele para trocar o CPF/CNPJ. */
  reentrarComGoogle?: boolean;
  erros?: Partial<Record<CampoComErro, string>>;
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
  const { senhaAtual, ...campos } = Object.fromEntries(formulario);
  const dados = perfil.safeParse(campos);
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

  // Trocar o CPF/CNPJ muda para onde vai o saque: confere de novo quem está pedindo, antes de
  // gravar qualquer coisa (src/servicos/troca-documento.ts).
  const sessao = documentoMudou ? await sessaoAtual() : null;
  if (documentoMudou) {
    if (!sessao || sessao.usuario.id !== usuario.id) return { erros: { senhaAtual: ERRO_SENHA } };
    const senha = typeof senhaAtual === "string" ? senhaAtual.slice(0, 200) : null;
    switch (await confirmarIdentidade(sessao, senha)) {
      case "senha":
        return { erros: { senhaAtual: ERRO_SENHA } };
      case "bloqueado":
        return {
          erros: { senhaAtual: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo." },
        };
      case "google_antigo":
        return { reentrarComGoogle: true };
    }
  }

  await atualizarContaDoFotografo(usuario.id, {
    ...resto,
    redesSociais: { ...(instagram && { instagram }), ...(site && { site }) },
  });
  let saquesLiberadosEm: string | undefined;
  if (documentoMudou && sessao) {
    // A chave Pix confirmada era o documento antigo e volta a exigir confirmação; os saques
    // ficam bloqueados por 72 horas, sai o aviso por e-mail e as outras sessões caem.
    const agora = Date.now();
    await trocarDocumento(sessao, novoDocumento, agora);
    saquesLiberadosEm = new Date(agora + BLOQUEIO_SAQUE_APOS_TROCA_MS).toISOString();
  }
  revalidatePath("/painel", "layout");
  return {
    ok: true,
    chavePendente: Boolean(novoDocumento) && (documentoMudou || !conta.chavePix),
    saquesLiberadosEm,
  };
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
