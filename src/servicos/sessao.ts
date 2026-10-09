import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import {
  buscarUsuario,
  buscarUsuarioParaLogin,
  buscarUsuarioPorGoogle,
  buscarContaDoFotografo,
  consumirConfirmacaoEmail,
  criarContaDeFotografo,
  criarContaDeFotografoSeNaoExistir,
  criarUsuario,
  encerrarTodasAsSessoes,
  emailEmUso,
  ligarContaGoogle,
  marcarEmailConfirmado,
  mudarPapelDoUsuario,
  revogarSessao,
  salvarConfirmacaoEmail,
  slugDeFotografoEmUso,
  usuarioDaSessao,
  versaoDaSessao,
  vincularPedidosDeConvidado,
  type FotografoConta,
  type Papel,
  type Usuario,
} from "@/dados";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import { emailEhGestor, type PerfilGoogle } from "@/lib/google";
import { gerarHashSenha, HASH_FALSO, senhaConfere } from "@/lib/senha";
import { gerarSlug } from "@/lib/slug";

import { conferirCodigoMfa } from "./mfa";

// Sessão simulada da Parte A (docs/tarefas.md, Fase 5). Na Fase 11 o Better Auth assume, com
// as mesmas garantias: cookie HttpOnly, token aleatório guardado só como hash, e e-mail
// confirmado antes de vincular compras.

const COOKIE = "clicouai_sessao";
const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Sessão de gestor vale no máximo 12 horas desde o login (expiração absoluta): a conta mexe em
 * reembolsos, papéis e denúncias, e um cookie esquecido num computador vale menos tempo.
 */
export const DURACAO_SESSAO_GESTOR_MS = 12 * 60 * 60 * 1000;
const DURACAO_CONFIRMACAO_MS = 24 * 60 * 60 * 1000;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function novoToken() {
  return randomBytes(32).toString("base64url");
}

// A sessão é um cookie assinado (APP_SECRET) com o id do usuário, a versão da conta, um id
// próprio da sessão (`j`), a hora e o jeito do login. Qualquer servidor confere sem depender de
// memória: na Vercel, cada requisição pode cair numa instância diferente.
//
// Encerrar no servidor (docs/arquitetura.md, "Sessão"):
//   - "Sair" grava o id desta sessão em `sessoes_revogadas` (até a hora em que o cookie venceria):
//     o cookie deixa de valer mesmo que alguém tenha copiado. Só o logout escreve; a leitura da
//     sessão continua uma consulta só (usuário e lista juntos, pela chave primária);
//   - "Sair de todos os dispositivos", troca de CPF/CNPJ, troca ou perda da senha e mudança da
//     conta Google mudam a versão da conta e derrubam todos os cookies de uma vez.
// Na Fase 11, o Better Auth pode assumir, com sessões no banco.
const PROPOSITO_SESSAO = "sessao";

export type MetodoLogin = "senha" | "google";

type DadosSessao = { u: string; v: string; j: string; t: number; m: MetodoLogin };

function lerDadosSessao(token: string | undefined): DadosSessao | null {
  if (!token || token.length > 1000) return null;
  const d = conferirAssinatura(PROPOSITO_SESSAO, token) as Partial<DadosSessao> | null;
  if (
    typeof d?.u !== "string" ||
    typeof d.v !== "string" ||
    typeof d.j !== "string" ||
    typeof d.t !== "number" ||
    (d.m !== "senha" && d.m !== "google")
  ) {
    return null;
  }
  return d as DadosSessao;
}

export type SessaoAtual = {
  usuario: Usuario;
  /** Como a pessoa entrou nesta sessão. */
  metodo: MetodoLogin;
  /** Quando entrou (ms). Trocar a sessão por outra, no mesmo aparelho, mantém a hora. */
  entrouEm: number;
};

/** Sessão atual, ou `null`. Lê o cookie: chamar dentro de <Suspense>. */
export async function sessaoAtual(): Promise<SessaoAtual | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  // Com Cache Components, o relógio só pode ser lido depois de esperar a requisição; sem isto o
  // Next acusa erro ao pré-renderizar o cabeçalho (por exemplo, na página "não encontrado").
  await connection();
  const dados = lerDadosSessao(token);
  if (!dados) return null;
  const usuario = await usuarioDaSessao(dados.u, dados.v, dados.j);
  if (!usuario) return null;
  if (usuario.papel === "admin" && Date.now() - dados.t > DURACAO_SESSAO_GESTOR_MS) return null;
  return { usuario, metodo: dados.m, entrouEm: dados.t };
}

/** Usuário da sessão atual, ou `null`. Lê o cookie: chamar dentro de <Suspense>. */
export async function usuarioAtual(): Promise<Usuario | null> {
  return (await sessaoAtual())?.usuario ?? null;
}

async function iniciarSessao(
  usuarioId: string,
  metodo: MetodoLogin,
  entrouEm: number = Date.now(),
) {
  const versao = await versaoDaSessao(usuarioId);
  if (!versao) return;
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  const dados: DadosSessao = { u: usuarioId, v: versao, j: randomUUID(), t: entrouEm, m: metodo };
  const token = assinar(PROPOSITO_SESSAO, dados, DURACAO_SESSAO_MS);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiraEm),
  });
}

// ---------------------------------------------------------------- Verificação em duas etapas
//
// Com a verificação ligada (src/servicos/mfa.ts), a senha certa (ou a volta do Google) não abre a
// sessão: grava um cookie assinado de 5 minutos dizendo quem passou pela primeira etapa, e a
// sessão só nasce em /entrar/codigo, com o código do app ou um código de recuperação. O cookie
// leva a versão da sessão: trocar a senha ou sair de todos os aparelhos também o invalida.

const COOKIE_MFA = "clicouai_mfa";
const PROPOSITO_MFA = "mfa_pendente";
const DURACAO_MFA_MS = 5 * 60 * 1000;

type DadosMfaPendente = { u: string; v: string; m: MetodoLogin; p: string | null };

async function pedirCodigoMfa(usuarioId: string, metodo: MetodoLogin, proximo: string | null) {
  const versao = await versaoDaSessao(usuarioId);
  if (!versao) return;
  const dados: DadosMfaPendente = { u: usuarioId, v: versao, m: metodo, p: proximo };
  (await cookies()).set(COOKIE_MFA, assinar(PROPOSITO_MFA, dados, DURACAO_MFA_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_MFA_MS / 1000,
  });
}

export type LoginPendente = { usuario: Usuario; metodo: MetodoLogin; proximo: string | null };

/** Quem passou pela senha (ou pelo Google) e ainda precisa digitar o código, ou `null`. */
export async function loginPendente(): Promise<LoginPendente | null> {
  const token = (await cookies()).get(COOKIE_MFA)?.value;
  if (!token || token.length > 1000) return null;
  await connection();
  const d = conferirAssinatura(PROPOSITO_MFA, token) as Partial<DadosMfaPendente> | null;
  if (
    typeof d?.u !== "string" ||
    typeof d.v !== "string" ||
    (d.m !== "senha" && d.m !== "google") ||
    (d.p !== null && typeof d.p !== "string")
  ) {
    return null;
  }
  if ((await versaoDaSessao(d.u)) !== d.v) return null;
  const usuario = await buscarUsuario(d.u);
  if (!usuario?.mfaAtivo) return null;
  return { usuario, metodo: d.m, proximo: d.p ?? null };
}

export type ResultadoCodigoLogin =
  | { ok: true; usuario: Usuario; proximo: string | null }
  | { ok: false; motivo: "expirado" | "invalido" | "bloqueado" };

/**
 * Segunda etapa do login: confere o código (com limite de tentativas por usuário) e, se
 * certo, abre a sessão e apaga o cookie da primeira etapa.
 */
export async function concluirLoginComCodigo(codigo: string): Promise<ResultadoCodigoLogin> {
  const pendente = await loginPendente();
  if (!pendente) return { ok: false, motivo: "expirado" };
  const resultado = await conferirCodigoMfa(pendente.usuario.id, codigo);
  if (resultado !== "ok") return { ok: false, motivo: resultado };
  (await cookies()).delete(COOKIE_MFA);
  await iniciarSessao(pendente.usuario.id, pendente.metodo);
  return { ok: true, usuario: pendente.usuario, proximo: pendente.proximo };
}

export type ResultadoEntrar = {
  usuario: Usuario;
  /** A verificação em duas etapas está ligada: a sessão só abre em /entrar/codigo. */
  pedeCodigo: boolean;
};

/**
 * Confere e-mail e senha e abre a sessão (ou, com a verificação em duas etapas ligada, pede o
 * código). E-mail inexistente e senha errada dão o mesmo resultado e levam o mesmo tempo
 * (compara com um hash falso), para não revelar quem tem conta.
 */
export async function entrar(
  email: string,
  senha: string,
  proximo: string | null = null,
): Promise<ResultadoEntrar | null> {
  const usuario = await buscarUsuarioParaLogin(email);
  const confere = senhaConfere(senha, usuario?.senhaHash ?? HASH_FALSO);
  if (!usuario || !confere || usuario.excluidoEm) return null;
  const publico = await buscarUsuario(usuario.id);
  if (!publico) return null;
  if (publico.mfaAtivo) {
    await pedirCodigoMfa(usuario.id, "senha", proximo);
    return { usuario: publico, pedeCodigo: true };
  }
  await iniciarSessao(usuario.id, "senha");
  return { usuario: publico, pedeCodigo: false };
}

/**
 * Sai deste aparelho: encerra a sessão no servidor (o id do cookie vai para
 * `sessoes_revogadas`) e apaga o cookie.
 */
export async function sair() {
  const jarra = await cookies();
  const dados = lerDadosSessao(jarra.get(COOKIE)?.value);
  if (dados) await revogarSessao(dados.j, Date.now() + DURACAO_SESSAO_MS);
  jarra.delete(COOKIE);
}

/** Sai de todos os aparelhos, inclusive deste: todos os cookies do usuário deixam de valer. */
export async function sairDeTodosOsDispositivos(usuarioId: string) {
  await encerrarTodasAsSessoes(usuarioId);
  (await cookies()).delete(COOKIE);
}

/**
 * Derruba as sessões dos outros aparelhos e mantém esta, com um cookie novo (troca de CPF/CNPJ,
 * troca de senha). A hora e o jeito do login desta sessão continuam os mesmos. Quem já mudou a
 * versão da sessão (a troca de senha grava o hash novo antes) passa a sessão lida antes da
 * mudança: depois dela, o cookie atual já não vale.
 */
export async function encerrarOutrasSessoes(usuarioId: string, sessaoAntes?: SessaoAtual | null) {
  const atual = sessaoAntes === undefined ? await sessaoAtual() : sessaoAntes;
  await encerrarTodasAsSessoes(usuarioId);
  if (atual?.usuario.id === usuarioId) {
    await iniciarSessao(usuarioId, atual.metodo, atual.entrouEm);
  }
}

export type ResultadoCadastro =
  { ok: true; usuario: Usuario; tokenConfirmacao: string } | { ok: false; motivo: "email_em_uso" };

/** Cria a conta, abre a sessão e gera o token de confirmação do e-mail. */
export async function cadastrar(dados: {
  nome: string;
  email: string;
  senha: string;
  papel: "cliente" | "fotografo";
}): Promise<ResultadoCadastro> {
  if (await emailEmUso(dados.email)) return { ok: false, motivo: "email_em_uso" };
  const usuario = await criarUsuario({
    nome: dados.nome,
    email: dados.email,
    senhaHash: gerarHashSenha(dados.senha),
    papel: dados.papel,
  });
  if (dados.papel === "fotografo") {
    // O perfil nasce com o nome da pessoa; ela completa em /painel/perfil.
    await criarContaDeFotografo({
      usuarioId: usuario.id,
      nomePublico: dados.nome,
      slug: await slugDisponivel(dados.nome),
    });
  }
  const tokenConfirmacao = await gerarConfirmacaoEmail(usuario.id);
  await iniciarSessao(usuario.id, "senha");
  return { ok: true, usuario, tokenConfirmacao };
}

/** Token para o link de confirmação do e-mail (vale 24 horas, uma vez só). */
export async function gerarConfirmacaoEmail(usuarioId: string) {
  const token = novoToken();
  await salvarConfirmacaoEmail(hash(token), usuarioId, Date.now() + DURACAO_CONFIRMACAO_MS);
  return token;
}

/**
 * Confirma o e-mail pelo link e liga à conta as compras feitas como convidado com o mesmo
 * e-mail. Devolve quantos pedidos foram vinculados, ou `null` se o link for inválido.
 */
export async function confirmarEmail(token: string): Promise<number | null> {
  const usuarioId = await consumirConfirmacaoEmail(hash(token));
  if (!usuarioId) return null;
  await marcarEmailConfirmado(usuarioId);
  return vincularPedidosDeConvidado(usuarioId);
}

export type ResultadoGoogle =
  | { ok: true; usuario: Usuario; novo: boolean; pedeCodigo: boolean }
  | { ok: false; motivo: "conta_google_diferente" };

/**
 * Entra com o perfil que o Google confirmou. Procura pela conta Google; se não achar, pelo
 * e-mail (o Google verificou que a pessoa é dona dele, então é seguro ligar as contas); se não
 * existir, cria. Quem pediu para vender vira fotógrafo; e-mails em ADMIN_EMAILS viram gestores.
 * Como o e-mail já vem confirmado, as compras feitas como convidado são ligadas à conta.
 */
export async function entrarComGoogle(
  perfil: PerfilGoogle,
  querVender: boolean,
  proximo: string | null = null,
): Promise<ResultadoGoogle> {
  let usuario = await buscarUsuarioPorGoogle(perfil.googleId);
  let novo = false;
  if (!usuario) {
    const existente = await buscarUsuarioParaLogin(perfil.email);
    if (existente) {
      if (!(await ligarContaGoogle(existente.id, perfil.googleId))) {
        return { ok: false, motivo: "conta_google_diferente" };
      }
      usuario = await buscarUsuario(existente.id);
    } else {
      usuario = await criarUsuario({
        nome: perfil.nome,
        email: perfil.email,
        senhaHash: null,
        papel: "cliente",
        googleId: perfil.googleId,
        emailConfirmado: true,
      });
      novo = true;
    }
  }
  if (!usuario) return { ok: false, motivo: "conta_google_diferente" };

  let papel: Papel = usuario.papel;
  if (emailEhGestor(usuario.email)) papel = "admin";
  else if (querVender && papel === "cliente") papel = "fotografo";
  if (papel !== usuario.papel) await mudarPapelDoUsuario(usuario.id, papel);
  if (papel === "fotografo" && !(await buscarContaDoFotografo(usuario.id))) {
    await criarContaDeFotografo({
      usuarioId: usuario.id,
      nomePublico: usuario.nome,
      slug: await slugDisponivel(usuario.nome),
    });
  }

  await vincularPedidosDeConvidado(usuario.id);
  const atualizado = await buscarUsuario(usuario.id);
  if (!atualizado) return { ok: false, motivo: "conta_google_diferente" };
  // O Google confirma o e-mail, não substitui o segundo fator: com a verificação em duas etapas
  // ligada, quem tem acesso só ao Gmail da pessoa ainda precisa do app autenticador.
  if (atualizado.mfaAtivo) {
    await pedirCodigoMfa(usuario.id, "google", proximo);
    return { ok: true, usuario: atualizado, novo, pedeCodigo: true };
  }
  await iniciarSessao(usuario.id, "google");
  return { ok: true, usuario: atualizado, novo, pedeCodigo: false };
}

/** Para onde mandar cada papel depois do login, quando não há um ?proximo=. */
export function inicioDoPapel(papel: Papel) {
  if (papel === "admin") return "/admin";
  if (papel === "fotografo") return "/painel";
  return "/minhas-compras";
}

async function slugDisponivel(nome: string) {
  const base = gerarSlug(nome) || "fotografo";
  let slug = base;
  for (let n = 2; await slugDeFotografoEmUso(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Quem usa o painel de fotógrafo: o fotógrafo e o gestor. O gestor usa com a própria conta de
 * fotógrafo (não é personificação: só mexe nos próprios eventos, fotos e saques). Se deixar de
 * ser gestor, perde o painel como qualquer cliente; a conta de fotógrafo fica, sem acesso.
 */
export function podeUsarPainel(usuario: Pick<Usuario, "papel">) {
  return usuario.papel === "fotografo" || usuario.papel === "admin";
}

/**
 * Conta de fotógrafo do usuário para o painel, ou `null` se ele não pode usar o painel. O gestor
 * sem conta ganha uma no primeiro acesso, com o nome dele e CPF/chave Pix vazios (ele completa
 * em Perfil e recebimento, como qualquer fotógrafo). Requisições ao mesmo tempo não criam duas:
 * fotografos.usuario_id é único e quem perde a corrida lê a conta criada pela outra.
 */
export async function contaDoPainel(usuario: Usuario): Promise<FotografoConta | null> {
  if (!podeUsarPainel(usuario)) return null;
  const conta = await buscarContaDoFotografo(usuario.id);
  if (conta || usuario.papel !== "admin") return conta;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const criada = await criarContaDeFotografoSeNaoExistir({
      usuarioId: usuario.id,
      nomePublico: usuario.nome,
      slug: await slugDisponivel(usuario.nome),
    });
    if (criada) return criada;
    // Outra requisição criou a conta (ou tomou o slug): confere e, se preciso, tenta de novo.
    const existente = await buscarContaDoFotografo(usuario.id);
    if (existente) return existente;
  }
  throw new Error("Não foi possível criar a conta de fotógrafo do gestor.");
}

/**
 * Fotógrafo (ou gestor) logado e a conta de fotógrafo dele, ou redireciona para o login. Usar no
 * topo de toda página e ação do painel: a autorização é conferida em cada uma, não só no menu.
 */
export async function exigirFotografo(proximo = "/painel"): Promise<{
  usuario: Usuario;
  conta: FotografoConta;
}> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect(`/entrar?proximo=${encodeURIComponent(proximo)}`);
  const conta = await contaDoPainel(usuario);
  if (!conta) redirect("/minhas-compras");
  return { usuario, conta };
}

/**
 * Gestor (admin) logado, ou redireciona. Usar no topo de toda página e ação do painel de
 * gestão: a autorização é conferida em cada uma, não só no menu.
 */
export async function exigirGestor(proximo = "/admin"): Promise<Usuario> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect(`/entrar?proximo=${encodeURIComponent(proximo)}`);
  if (usuario.papel !== "admin") redirect(inicioDoPapel(usuario.papel));
  return usuario;
}

/**
 * Muda o papel de um usuário pelo painel de gestão. Ninguém muda o próprio papel (evita um
 * gestor se trancar fora). Quem vira fotógrafo ganha o perfil de vendedor, se ainda não tiver.
 */
export async function definirPapelDoUsuario(
  gestor: Usuario,
  usuarioId: string,
  papel: Papel,
): Promise<"ok" | "proprio" | "inexistente"> {
  if (gestor.id === usuarioId) return "proprio";
  const alvo = await buscarUsuario(usuarioId);
  if (!alvo) return "inexistente";
  await mudarPapelDoUsuario(usuarioId, papel);
  if (papel === "fotografo" && !(await buscarContaDoFotografo(usuarioId))) {
    await criarContaDeFotografo({
      usuarioId,
      nomePublico: alvo.nome,
      slug: await slugDisponivel(alvo.nome),
    });
  }
  return "ok";
}
