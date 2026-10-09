import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  apagarCodigoEmail,
  apagarRedefinicoesDoUsuario,
  buscarUsuario,
  buscarUsuarioParaLogin,
  consumirRedefinicaoSenha,
  definirSenhaDoUsuario,
  encerrarTodasAsSessoes,
  marcarEmailConfirmado,
  salvarRedefinicaoSenha,
  vincularPedidosDeConvidado,
} from "@/dados";
import { emailEhGestorDeAmbiente } from "@/dados/exemplo/gestores";
import { gerarHashSenha } from "@/lib/senha";

import { zerarTentativas } from "./limites";
import {
  avisarContaSoComGoogle,
  avisarRedefinicaoDeSenha,
  avisarSenhaDeGestor,
  enviarLinkDeRedefinicao,
} from "./mensagens";

// "Esqueci a senha" (docs/arquitetura.md, "Esqueci a senha"). O pedido sempre recebe a mesma
// resposta, exista a conta ou não; o link leva um token aleatório de 32 bytes, guardado só como
// SHA-256, que vale 30 minutos e uma vez só. O token vai depois do # do link
// (/entrar/nova-senha#token=…): o navegador não manda essa parte ao servidor, então ela não
// aparece em log de acesso, no Sentry nem no Referer; a tela lê o token e o envia no corpo do
// formulário.

export const VALIDADE_REDEFINICAO_MS = 30 * 60 * 1000;

export const TOKEN_REDEFINICAO = /^[\w-]{40,60}$/;

function hashDoToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type ResultadoPedidoRedefinicao =
  | "link"
  | "so_google"
  | "gestor"
  | "nada"
  | /** O e-mail com o link não saiu (produção sem o Resend). */ "falhou";

/**
 * Atende um pedido de "Esqueci a senha". Quem chama responde sempre do mesmo jeito; o resultado
 * só serve aos testes. Conta inexistente ou excluída: nada é enviado. Conta só com o Google: um
 * e-mail explica que ela entra com o Google. Gestor de GESTORES: a senha vem da variável.
 */
export async function pedirRedefinicaoDeSenha(
  email: string,
  agora = Date.now(),
): Promise<ResultadoPedidoRedefinicao> {
  const interno = await buscarUsuarioParaLogin(email);
  if (!interno || interno.excluidoEm) return "nada";
  if (emailEhGestorDeAmbiente(interno.email)) {
    await avisarSenhaDeGestor(interno.email, interno.nome);
    return "gestor";
  }
  if (!interno.senhaHash) {
    await avisarContaSoComGoogle(interno.email, interno.nome);
    return "so_google";
  }
  const token = randomBytes(32).toString("base64url");
  await salvarRedefinicaoSenha(hashDoToken(token), interno.id, agora + VALIDADE_REDEFINICAO_MS);
  return (await enviarLinkDeRedefinicao(interno.email, interno.nome, token)) ? "link" : "falhou";
}

export type ResultadoRedefinicao = { ok: true; email: string } | { ok: false; motivo: "invalido" };

/**
 * Troca a senha com o token do link. O token é usado mesmo que algo falhe depois (uma vez só).
 * Grava só o hash da senha nova: a versão da sessão muda junto e todas as sessões abertas caem.
 * Os outros links pendentes da conta deixam de valer. Abrir o link prova que a pessoa recebe os
 * e-mails do endereço: uma conta antiga ainda não confirmada fica confirmada.
 */
export async function redefinirSenha(
  token: string,
  novaSenha: string,
  agora = Date.now(),
): Promise<ResultadoRedefinicao> {
  if (!TOKEN_REDEFINICAO.test(token)) return { ok: false, motivo: "invalido" };
  const usuarioId = await consumirRedefinicaoSenha(hashDoToken(token), agora);
  if (!usuarioId) return { ok: false, motivo: "invalido" };
  const usuario = await buscarUsuario(usuarioId);
  if (!usuario || emailEhGestorDeAmbiente(usuario.email)) return { ok: false, motivo: "invalido" };
  const interno = await buscarUsuarioParaLogin(usuario.email);
  // Conta excluída ou que passou a entrar só com o Google depois do pedido.
  if (!interno || interno.id !== usuarioId || interno.excluidoEm || !interno.senhaHash) {
    return { ok: false, motivo: "invalido" };
  }
  if (!(await definirSenhaDoUsuario(usuarioId, gerarHashSenha(novaSenha), interno.senhaHash))) {
    return { ok: false, motivo: "invalido" };
  }
  // O hash novo já muda a versão da sessão; subir a versão deixa isso explícito.
  await encerrarTodasAsSessoes(usuarioId);
  await apagarRedefinicoesDoUsuario(usuarioId);
  if (!usuario.emailConfirmado) {
    await marcarEmailConfirmado(usuarioId);
    await apagarCodigoEmail(usuario.email);
    await vincularPedidosDeConvidado(usuarioId);
  }
  // As tentativas erradas de login deste e-mail não seguram quem acabou de provar quem é.
  await zerarTentativas("login_email", usuario.email);
  // O aviso não pode desfazer a troca: se falhar, fica no log (sem a senha nem o token).
  await avisarRedefinicaoDeSenha(usuario.email, usuario.nome, new Date(agora).toISOString()).catch(
    (erro) =>
      console.error(
        "[seguranca] falha ao avisar a redefinição de senha",
        erro instanceof Error ? erro.name : "desconhecido",
      ),
  );
  return { ok: true, email: usuario.email };
}
