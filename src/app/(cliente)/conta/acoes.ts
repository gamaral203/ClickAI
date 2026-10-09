"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { papelEscolhido, type PapelCadastro } from "@/lib/cadastro";
import { emailConfigurado } from "@/lib/email";
import { caminhoSeguro, destinoDoCadastro } from "@/lib/redirecionamento";
import { senhaNovaSchema } from "@/lib/regras-senha";
import { destinoSemEnvio, podeEnviarConfirmacao } from "@/servicos/confirmacao-email";
import { excluirConta } from "@/servicos/exclusao-conta";
import {
  cadastroBloqueado,
  limiteAtingido,
  limiteDoIpAtingido,
  loginBloqueado,
  loginDeuCerto,
} from "@/servicos/limites";
import { enviarConfirmacaoDeEmail } from "@/servicos/mensagens";
import { MENSAGENS_CODIGO } from "@/servicos/mfa";
import {
  cadastrar,
  comecarAVender,
  concluirLoginComCodigo,
  entrar,
  gerarConfirmacaoEmail,
  inicioDoPapel,
  sair,
  sairDeTodosOsDispositivos,
  usuarioAtual,
} from "@/servicos/sessao";

export type EstadoFormulario = {
  erro?: string;
  erros?: Partial<Record<"nome" | "email" | "senha" | "papel", string>>;
  /** Valores para devolver ao formulário (nunca a senha). */
  valores?: { nome?: string; email?: string; papel?: PapelCadastro };
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
  const proximoBruto = formulario.get("proximo");
  const proximo = typeof proximoBruto === "string" && proximoBruto ? proximoBruto : null;
  const resultado = await entrar(dados.data.email, dados.data.senha, proximo);
  // Mesma mensagem para e-mail inexistente e senha errada.
  if (!resultado) return { erro: "E-mail ou senha incorretos.", valores: { email } };
  await loginDeuCerto(dados.data.email);
  // Verificação em duas etapas ligada: a sessão só abre depois do código.
  if (resultado.pedeCodigo) redirect("/entrar/codigo");
  // Sem ?proximo=, cada papel vai para a sua área (gestão, painel ou compras).
  redirect(caminhoSeguro(proximo, inicioDoPapel(resultado.usuario.papel)));
}

export type EstadoCodigoLogin = { erro?: string };

const codigoLogin = z.object({ codigo: z.string().trim().min(6).max(40) });

/** Segunda etapa do login, com a verificação em duas etapas ligada (/entrar/codigo). */
export async function confirmarCodigoLoginAcao(
  _anterior: EstadoCodigoLogin,
  formulario: FormData,
): Promise<EstadoCodigoLogin> {
  const dados = codigoLogin.safeParse({ codigo: formulario.get("codigo") });
  if (!dados.success) return { erro: MENSAGENS_CODIGO.faltando };
  const resultado = await concluirLoginComCodigo(dados.data.codigo);
  if (!resultado.ok) {
    if (resultado.motivo === "expirado") redirect("/entrar?erro=codigo_expirado");
    return { erro: MENSAGENS_CODIGO[resultado.motivo] };
  }
  redirect(caminhoSeguro(resultado.proximo, inicioDoPapel(resultado.usuario.papel)));
}

const cadastro = z.object({
  nome: z
    .string("Informe seu nome.")
    .trim()
    .min(2, "Informe seu nome.")
    .max(100, "Nome muito longo."),
  email: z.email("Informe um e-mail válido.").max(254),
  senha: senhaNovaSchema,
  papel: z.enum(["cliente", "fotografo"], "Escolha o tipo de conta."),
});

export async function cadastrarAcao(
  _anterior: EstadoFormulario,
  formulario: FormData,
): Promise<EstadoFormulario> {
  const papel = formulario.get("papel");
  // O papel volta junto: depois do erro, o formulário continua com o tipo de conta escolhido.
  const valores = {
    nome: String(formulario.get("nome") ?? ""),
    email: String(formulario.get("email") ?? ""),
    papel: papelEscolhido(papel, "cliente"),
  };
  const dados = cadastro.safeParse({
    nome: valores.nome,
    email: valores.email,
    senha: formulario.get("senha"),
    papel,
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

/**
 * "Quero vender" de quem já tem conta de comprador (/cadastro?tipo=fotografo, logado): passa a
 * conta para fotógrafo e abre o painel. Só mexe na conta do próprio usuário logado.
 */
export async function comecarAVenderAcao() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar?proximo=%2Fcadastro%3Ftipo%3Dfotografo");
  if (!(await comecarAVender(usuario))) redirect("/minhas-compras");
  redirect("/painel");
}

export async function sairAcao() {
  await sair();
  redirect("/");
}

/** "Sair de todos os dispositivos": derruba todas as sessões da conta, inclusive esta. */
export async function sairDeTodosAcao() {
  const usuario = await usuarioAtual();
  if (usuario) await sairDeTodosOsDispositivos(usuario.id);
  redirect("/entrar?saiu=todos");
}

/** Gera e envia um novo link de confirmação para o usuário logado. */
export async function reenviarConfirmacaoAcao() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  if (usuario.emailConfirmado) redirect("/minhas-compras");
  // Sem envio de e-mail na produção, não adianta gerar link nem gastar o limite: só avisa.
  if (!podeEnviarConfirmacao()) {
    redirect(
      `/conta/confirmar-email?indisponivel=1&proximo=${encodeURIComponent("/minhas-compras")}`,
    );
  }
  // Cada reenvio manda um e-mail pelo Resend: limite por IP e por conta, contados no banco. O
  // limite por IP é próprio do reenvio: antes era o do cadastro, e quem apertava "Confirmar
  // e-mail" algumas vezes travava o cadastro de todo mundo na mesma rede.
  if (
    (await limiteDoIpAtingido("email_confirmacao_ip")) ||
    (await limiteAtingido("email_confirmacao_usuario", usuario.id))
  ) {
    redirect("/conta/confirmar-email?limite=1");
  }
  const token = await gerarConfirmacaoEmail(usuario.id);
  await confirmarPorEmail(
    usuario.email,
    usuario.nome,
    token,
    "/conta/confirmar-email?enviado=1",
    // Se não sair, "Continuar" leva às compras, e não de volta para esta mesma tela.
    "/minhas-compras",
  );
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
  destinoSeNaoSair = destino,
): Promise<never> {
  const enviado = emailConfigurado() && (await enviarConfirmacaoDeEmail(email, nome, token));
  if (enviado) redirect(destino);
  redirect(destinoSemEnvio(token, destinoSeNaoSair));
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
