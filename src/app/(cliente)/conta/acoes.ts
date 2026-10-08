"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { emailConfigurado } from "@/lib/email";
import { caminhoSeguro, destinoDoCadastro } from "@/lib/redirecionamento";
import { destinoSemEnvio } from "@/servicos/confirmacao-email";
import { excluirConta } from "@/servicos/exclusao-conta";
import {
  cadastroBloqueado,
  limiteAtingido,
  loginBloqueado,
  loginDeuCerto,
} from "@/servicos/limites";
import { enviarConfirmacaoDeEmail } from "@/servicos/mensagens";
import {
  cadastrar,
  entrar,
  gerarConfirmacaoEmail,
  inicioDoPapel,
  sair,
  usuarioAtual,
} from "@/servicos/sessao";

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
  if (await loginBloqueado(dados.data.email)) {
    return {
      erro: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo, ou entre com o Google.",
      valores: { email },
    };
  }
  const usuario = await entrar(dados.data.email, dados.data.senha);
  // Mesma mensagem para e-mail inexistente e senha errada.
  if (!usuario) return { erro: "E-mail ou senha incorretos.", valores: { email } };
  await loginDeuCerto(dados.data.email);
  // Sem ?proximo=, cada papel vai para a sua área (gestão, painel ou compras).
  redirect(caminhoSeguro(formulario.get("proximo"), inicioDoPapel(usuario.papel)));
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

  if (await cadastroBloqueado()) {
    return { erro: "Muitos cadastros seguidos daqui. Espere um pouco e tente de novo.", valores };
  }
  const resultado = await cadastrar(dados.data);
  if (!resultado.ok) {
    return {
      erros: { email: "Já existe uma conta com este e-mail. Entre ou use outro e-mail." },
      valores,
    };
  }
  // Conta nova vai para a tela principal; quem veio pelo link do fotógrafo volta para ele.
  return confirmarPorEmail(
    resultado.usuario.email,
    resultado.usuario.nome,
    resultado.tokenConfirmacao,
    destinoDoCadastro(formulario.get("proximo"), dados.data.papel),
  );
}

export async function sairAcao() {
  await sair();
  redirect("/");
}

/** Gera e envia um novo link de confirmação para o usuário logado. */
export async function reenviarConfirmacaoAcao() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  if (usuario.emailConfirmado) redirect("/minhas-compras");
  // Cada reenvio manda um e-mail pelo Resend: limite por IP e por conta, contados no banco.
  if (
    (await cadastroBloqueado()) ||
    (await limiteAtingido("email_confirmacao_usuario", usuario.id))
  ) {
    redirect("/conta/confirmar-email?limite=1");
  }
  const token = await gerarConfirmacaoEmail(usuario.id);
  await confirmarPorEmail(usuario.email, usuario.nome, token, "/conta/confirmar-email?enviado=1");
}

/**
 * Manda o link de confirmação por e-mail e segue para o destino. Se o e-mail não sair, fora da
 * produção mostra o link na tela (ambiente de exemplo); na produção, só avisa que o envio está
 * indisponível, sem o link (ver destinoSemEnvio).
 */
async function confirmarPorEmail(
  email: string,
  nome: string,
  token: string,
  destino: string,
): Promise<never> {
  const enviado = emailConfigurado() && (await enviarConfirmacaoDeEmail(email, nome, token));
  if (enviado) redirect(destino);
  redirect(destinoSemEnvio(token, destino));
}

export type EstadoExclusao = {
  erro?: string;
  erros?: Partial<Record<"senha" | "email" | "entendo", string>>;
};

const exclusao = z.object({
  senha: z.string().max(200).optional(),
  email: z.string().max(254).optional(),
  entendo: z.literal("sim", "Marque que você entendeu que a exclusão não pode ser desfeita."),
});

/**
 * Exclui a conta do usuário logado (docs/arquitetura.md, "Exclusão de conta"). Quem tem senha
 * confirma com ela, com o mesmo limite de tentativas do login; quem só entra com o Google digita
 * o e-mail. Depois, apaga o cookie: os de outros aparelhos já não valem (versão da sessão).
 */
export async function excluirContaAcao(
  _anterior: EstadoExclusao,
  formulario: FormData,
): Promise<EstadoExclusao> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar?proximo=/conta/excluir");

  const dados = exclusao.safeParse({
    senha: formulario.get("senha") ?? undefined,
    email: formulario.get("email") ?? undefined,
    entendo: formulario.get("entendo") ?? undefined,
  });
  if (!dados.success) {
    return { erros: { entendo: "Marque que você entendeu que a exclusão não pode ser desfeita." } };
  }
  if (await loginBloqueado(usuario.email)) {
    return { erro: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo." };
  }

  const resultado = await excluirConta(usuario, dados.data);
  if (resultado.ok) {
    await sair();
    redirect("/conta/excluida");
  }
  switch (resultado.motivo) {
    case "senha":
      return { erros: { senha: "Senha incorreta." } };
    case "confirmacao":
      return { erros: { email: "Digite o e-mail da sua conta, igual ao mostrado acima." } };
    case "gestor":
      return { erro: "Contas de gestor não podem ser excluídas por aqui." };
    case "impedimento":
      // A página mostra o motivo; recarregar atualiza a explicação.
      redirect("/conta/excluir");
    default:
      return { erro: "Não foi possível excluir a conta. Recarregue a página e tente de novo." };
  }
}
