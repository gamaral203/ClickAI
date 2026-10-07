"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { caminhoSeguro } from "@/lib/redirecionamento";
import { cadastrar, entrar, sair } from "@/servicos/sessao";

export type EstadoFormulario = {
  erro?: string;
  erros?: Partial<Record<"nome" | "email" | "senha" | "papel", string>>;
  /** Valores para devolver ao formulário (nunca a senha). */
  valores?: { nome?: string; email?: string };
};

const login = z.object({
  email: z.email("Informe um e-mail válido.").max(254),
  senha: z.string().min(1, "Informe a senha.").max(200),
});

export async function entrarAcao(
  _anterior: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const email = String(formulario.get("email") ?? "");
  const dados = login.safeParse({ email, senha: formulario.get("senha") });
  if (!dados.success) {
    return { erro: "Informe e-mail e senha.", valores: { email } };
  }
  const usuario = await entrar(dados.data.email, dados.data.senha);
  // Mesma mensagem para e-mail inexistente e senha errada.
  if (!usuario) return { erro: "E-mail ou senha incorretos.", valores: { email } };
  redirect(caminhoSeguro(formulario.get("proximo")));
}

const cadastro = z.object({
  nome: z
    .string("Informe seu nome.")
    .trim()
    .min(2, "Informe seu nome.")
    .max(100, "Nome muito longo."),
  email: z.email("Informe um e-mail válido.").max(254),
  senha: z
    .string("A senha precisa ter pelo menos 8 caracteres.")
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
    .max(200, "Senha muito longa."),
  papel: z.enum(["cliente", "fotografo"], "Escolha o tipo de conta."),
});

export async function cadastrarAcao(
  _anterior: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const valores = {
    nome: String(formulario.get("nome") ?? ""),
    email: String(formulario.get("email") ?? ""),
  };
  const dados = cadastro.safeParse({
    ...valores,
    senha: formulario.get("senha"),
    papel: formulario.get("papel"),
  });
  if (!dados.success) {
    const erros: EstadoFormulario["erros"] = {};
    for (const problema of dados.error.issues) {
      const campo = problema.path[0] as keyof NonNullable<EstadoFormulario["erros"]>;
      erros[campo] ??= problema.message;
    }
    return { erros, valores };
  }

  const resultado = await cadastrar(dados.data);
  if (!resultado.ok) {
    return {
      erros: { email: "Já existe uma conta com este e-mail. Entre ou use outro e-mail." },
      valores,
    };
  }
  redirect(`/conta/confirmar-email?token=${resultado.tokenConfirmacao}`);
}

export async function sairAcao() {
  await sair();
  redirect("/");
}
