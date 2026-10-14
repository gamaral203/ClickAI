"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { senhaNovaSchema, TAMANHO_MAXIMO_SENHA } from "@/lib/regras-senha";
import { limiteAtingido, limiteDoIpAtingido } from "@/servicos/limites";
import { pedirRedefinicaoDeSenha, redefinirSenha } from "@/servicos/redefinicao-senha";

// "Esqueci a senha" (/entrar/esqueci-senha) e a senha nova pelo link (/entrar/nova-senha). As
// regras ficam em src/servicos/redefinicao-senha.ts.

export type EstadoEsqueci = { enviado?: boolean; erro?: string; email?: string };

const pedido = z.object({ email: z.email("Informe um e-mail válido.").max(254) });

/**
 * Pede o link de redefinição. A resposta é a mesma exista a conta ou não, e chega no mesmo tempo:
 * a busca e o envio do e-mail rodam depois da resposta (`after`), então a demora do envio não
 * revela quem tem conta.
 */
export async function esqueciSenhaAcao(
  _anterior: EstadoEsqueci,
  formulario: FormData,
): Promise<EstadoEsqueci> {
  const email = String(formulario.get("email") ?? "").trim();
  const dados = pedido.safeParse({ email });
  if (!dados.success) return { erro: "Informe um e-mail válido.", email };
  const [porIp, porEmail] = await Promise.all([
    limiteDoIpAtingido("esqueci_senha_ip"),
    limiteAtingido("esqueci_senha_email", dados.data.email),
  ]);
  if (porIp || porEmail) {
    return {
      erro: "Você pediu vários links seguidos. Espere um pouco e confira a caixa de entrada e o spam.",
      email,
    };
  }
  after(async () => {
    try {
      await pedirRedefinicaoDeSenha(dados.data.email);
    } catch (erro) {
      // Só o nome do erro: nada do e-mail nem do token no log.
      console.error(
        "[auth] falha no pedido de redefinição de senha",
        erro instanceof Error ? erro.name : "desconhecido",
      );
    }
  });
  return { enviado: true, email: dados.data.email };
}

export type CampoNovaSenha = "novaSenha" | "confirmacao";

export type EstadoNovaSenha = {
  erro?: string;
  erros?: Partial<Record<CampoNovaSenha, string>>;
  /** O link venceu, já foi usado ou não existe. */
  linkInvalido?: boolean;
};

const novaSenha = z
  .object({
    token: z.string().max(100),
    novaSenha: senhaNovaSchema,
    confirmacao: z.string("Repita a nova senha.").max(TAMANHO_MAXIMO_SENHA),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    path: ["confirmacao"],
    message: "A confirmação não é igual à nova senha.",
  });

/** Grava a senha nova com o token do link e leva ao login. */
export async function redefinirSenhaAcao(
  _anterior: EstadoNovaSenha,
  formulario: FormData,
): Promise<EstadoNovaSenha> {
  const texto = (nome: string) => {
    const v = formulario.get(nome);
    return typeof v === "string" ? v : "";
  };
  const dados = novaSenha.safeParse({
    token: texto("token"),
    novaSenha: texto("novaSenha"),
    confirmacao: texto("confirmacao"),
  });
  if (!dados.success) {
    const erros: EstadoNovaSenha["erros"] = {};
    for (const problema of dados.error.issues) {
      const campo = problema.path[0];
      if (campo === "novaSenha" || campo === "confirmacao") erros[campo] ??= problema.message;
    }
    if (Object.keys(erros).length === 0) return { linkInvalido: true };
    return { erros };
  }
  if (await limiteDoIpAtingido("redefinir_senha_ip")) {
    return { erro: "Muitas tentativas seguidas daqui. Espere 15 minutos e tente de novo." };
  }
  const resultado = await redefinirSenha(dados.data.token, dados.data.novaSenha);
  if (!resultado.ok) return { linkInvalido: true };
  redirect("/entrar?senha=redefinida");
}
