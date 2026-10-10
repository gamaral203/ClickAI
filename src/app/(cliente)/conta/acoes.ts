"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { papelEscolhido, type PapelCadastro } from "@/lib/cadastro";
import { podeComprar } from "@/lib/navegacao";
import { caminhoSeguro, destinoDoCadastro } from "@/lib/redirecionamento";
import { senhaNovaSchema } from "@/lib/regras-senha";
import { reenviarCodigo, type ResultadoEnvioCodigo } from "@/servicos/confirmacao-email";
import { excluirConta } from "@/servicos/exclusao-conta";
import {
  cadastroBloqueado,
  limiteDoIpAtingido,
  loginBloqueado,
  loginDeuCerto,
} from "@/servicos/limites";
import { MENSAGENS_CODIGO } from "@/servicos/mfa";
import {
  cadastrar,
  comecarAVender,
  concluirLoginComCodigo,
  confirmarEmailComCodigo,
  emailAguardandoConfirmacao,
  entrar,
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
  // E-mail ainda não confirmado: a sessão só abre depois do código mandado por e-mail.
  if (resultado.pedeConfirmacao) redirect(telaDoCodigo(resultado.envio));
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
  const proximoBruto = formulario.get("proximo");
  const proximo = typeof proximoBruto === "string" && proximoBruto ? proximoBruto : null;
  const resultado = await cadastrar(dados.data, proximo);
  if (!resultado.ok) {
    if (resultado.motivo === "email_em_uso") {
      return {
        erros: { email: "Já existe uma conta com este e-mail. Entre ou use outro e-mail." },
        valores,
      };
    }
    return { erro: MENSAGENS_ENVIO[resultado.motivo], valores };
  }
  // A conta só nasce com o código que foi para o e-mail.
  redirect("/cadastro/codigo");
}

const MENSAGENS_ENVIO = {
  limite:
    "Muitos códigos pedidos seguidos para este e-mail ou desta rede. Espere um pouco e tente de novo.",
  indisponivel:
    "Não conseguimos enviar o código de confirmação agora. Tente de novo em alguns minutos.",
} as const;

/** Tela do código, com o aviso do que houve com o envio (se não saiu). */
function telaDoCodigo(envio: ResultadoEnvioCodigo) {
  if (envio.ok || envio.motivo === "espera") return "/cadastro/codigo";
  return `/cadastro/codigo?envio=${envio.motivo === "limite" ? "limite" : "indisponivel"}`;
}

export type EstadoCodigoEmail = { erro?: string; aviso?: string; espera?: number };

const codigoEmail = z.object({ codigo: z.string().trim().min(1).max(20) });

/**
 * Tela /cadastro/codigo: confere o código de confirmação do e-mail. Certo, a conta passa a valer,
 * as compras de convidado com o mesmo e-mail são ligadas e a sessão abre.
 */
export async function confirmarCodigoEmailAcao(
  _anterior: EstadoCodigoEmail,
  formulario: FormData,
): Promise<EstadoCodigoEmail> {
  const dados = codigoEmail.safeParse({ codigo: formulario.get("codigo") });
  if (!dados.success) return { erro: "Digite o código de 6 dígitos que enviamos por e-mail." };
  if (await limiteDoIpAtingido("codigo_email_conferencia_ip")) {
    return { erro: "Muitas tentativas seguidas daqui. Espere 15 minutos e tente de novo." };
  }
  const resultado = await confirmarEmailComCodigo(dados.data.codigo);
  if (!resultado.ok) {
    switch (resultado.motivo) {
      case "invalido":
        return {
          erro: `Código incorreto. ${resultado.restantes === 1 ? "Resta 1 tentativa" : `Restam ${resultado.restantes} tentativas`} para este código.`,
        };
      case "bloqueado":
        return { erro: "Muitas tentativas erradas. Peça um código novo abaixo." };
      case "expirado":
        return { erro: "Este código venceu. Peça um código novo abaixo." };
      case "email_em_uso":
        redirect("/entrar?erro=conta_existente");
      default:
        redirect("/cadastro/codigo");
    }
  }
  if (resultado.pedeCodigo) redirect("/entrar/codigo");
  const { usuario, proximo, vinculados, novo } = resultado;
  // Compras de convidado ligadas à conta: o cliente vê em Minhas compras. Quem vende segue para o
  // painel (conta de fotógrafo não compra; os pedidos continuam abrindo pelo link do e-mail).
  if (vinculados > 0 && !proximo && podeComprar(usuario)) {
    redirect(`/minhas-compras?vinculadas=${vinculados}`);
  }
  redirect(
    novo
      ? destinoDoCadastro(proximo, usuario.papel)
      : caminhoSeguro(proximo, inicioDoPapel(usuario.papel)),
  );
}

/** "Reenviar código" da tela /cadastro/codigo. */
export async function reenviarCodigoEmailAcao(): Promise<EstadoCodigoEmail> {
  const email = await emailAguardandoConfirmacao();
  if (!email) redirect("/cadastro/codigo");
  const resultado = await reenviarCodigo(email);
  if (resultado.ok) return { aviso: "Enviamos um código novo. Confira também o spam.", espera: 60 };
  switch (resultado.motivo) {
    case "espera":
      return {
        erro: `Espere ${resultado.segundos} segundos para pedir outro código.`,
        espera: resultado.segundos,
      };
    case "sem_cadastro":
      redirect("/cadastro/codigo");
    default:
      return { erro: MENSAGENS_ENVIO[resultado.motivo] };
  }
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

/**
 * "Sair para comprar", nas telas de compra abertas por quem vende: conta de fotógrafo não compra,
 * então a pessoa sai e volta ao carrinho (guardado no navegador) como convidada.
 */
export async function sairParaComprarAcao() {
  await sair();
  redirect("/carrinho");
}

/** "Sair de todos os dispositivos": derruba todas as sessões da conta, inclusive esta. */
export async function sairDeTodosAcao() {
  const usuario = await usuarioAtual();
  if (usuario) await sairDeTodosOsDispositivos(usuario.id);
  redirect("/entrar?saiu=todos");
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
