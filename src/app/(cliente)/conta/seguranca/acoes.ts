"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { senhaNovaSchema, TAMANHO_MAXIMO_SENHA } from "@/lib/regras-senha";
import { MENSAGENS_CODIGO } from "@/servicos/mfa";
import { sessaoAtual } from "@/servicos/sessao";
import { trocarSenha, type MotivoRecusaSenha } from "@/servicos/troca-senha";

// Troca (ou criação) de senha em /conta/seguranca. As regras ficam em src/servicos/troca-senha.ts.

export type CampoSenha = "senhaAtual" | "novaSenha" | "confirmacao" | "codigoMfa";

export type EstadoSenha = {
  /** Mensagem de sucesso (a sessão continua aberta neste aparelho). */
  ok?: string;
  erro?: string;
  erros?: Partial<Record<CampoSenha, string>>;
  /** Conta só com o Google: precisa entrar de novo com ele para criar a senha. */
  reentrarComGoogle?: boolean;
};

const ERRO_SENHA_ATUAL = "Senha atual incorreta.";

const entrada = z
  .object({
    senhaAtual: z.string().max(TAMANHO_MAXIMO_SENHA).optional(),
    novaSenha: senhaNovaSchema,
    confirmacao: z.string("Repita a nova senha.").max(TAMANHO_MAXIMO_SENHA),
    codigoMfa: z.string().max(40).optional(),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    path: ["confirmacao"],
    message: "A confirmação não é igual à nova senha.",
  })
  .refine((d) => !d.senhaAtual || d.novaSenha !== d.senhaAtual, {
    path: ["novaSenha"],
    message: "A nova senha precisa ser diferente da atual.",
  });

const RESPOSTA: Record<MotivoRecusaSenha, EstadoSenha> = {
  senha: { erros: { senhaAtual: ERRO_SENHA_ATUAL } },
  bloqueado: { erro: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo." },
  igual: { erros: { novaSenha: "A nova senha precisa ser diferente da atual." } },
  google_antigo: { reentrarComGoogle: true },
  gestor_ambiente: {
    erro: "A senha desta conta de gestor é definida pela equipe técnica e não muda por aqui.",
  },
  codigo_faltando: { erros: { codigoMfa: MENSAGENS_CODIGO.faltando } },
  codigo_invalido: { erros: { codigoMfa: MENSAGENS_CODIGO.invalido } },
  codigo_bloqueado: { erros: { codigoMfa: MENSAGENS_CODIGO.bloqueado } },
  mudou: { erro: "A senha da conta acabou de mudar. Recarregue a página e tente de novo." },
};

export async function trocarSenhaAcao(
  _anterior: EstadoSenha,
  formulario: FormData,
): Promise<EstadoSenha> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/entrar?proximo=/conta/seguranca");

  const texto = (nome: string) => {
    const v = formulario.get(nome);
    return typeof v === "string" ? v : undefined;
  };
  const dados = entrada.safeParse({
    senhaAtual: texto("senhaAtual") || undefined,
    novaSenha: texto("novaSenha") ?? "",
    confirmacao: texto("confirmacao") ?? "",
    codigoMfa: texto("codigoMfa"),
  });
  if (!dados.success) {
    const erros: EstadoSenha["erros"] = {};
    for (const problema of dados.error.issues) {
      const campo = problema.path[0] as CampoSenha;
      erros[campo] ??= problema.message;
    }
    return { erros };
  }

  const resultado = await trocarSenha(sessao, dados.data);
  if (!resultado.ok) return RESPOSTA[resultado.motivo];
  return {
    ok: resultado.criada
      ? "Senha criada. Agora você também pode entrar com e-mail e senha. As outras sessões foram encerradas."
      : "Senha trocada. Você continua conectado aqui; as outras sessões foram encerradas.",
  };
}
