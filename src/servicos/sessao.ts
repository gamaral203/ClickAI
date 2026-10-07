import "server-only";

import { createHash, randomBytes } from "node:crypto";

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
  criarUsuario,
  emailEmUso,
  ligarContaGoogle,
  marcarEmailConfirmado,
  mudarPapelDoUsuario,
  salvarConfirmacaoEmail,
  slugDeFotografoEmUso,
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

// Sessão simulada da Parte A (docs/tarefas.md, Fase 5). Na Fase 11 o Better Auth assume, com
// as mesmas garantias: cookie HttpOnly, token aleatório guardado só como hash, e e-mail
// confirmado antes de vincular compras.

const COOKIE = "clicouai_sessao";
const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;
const DURACAO_CONFIRMACAO_MS = 24 * 60 * 60 * 1000;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function novoToken() {
  return randomBytes(32).toString("base64url");
}

// A sessão é um cookie assinado (APP_SECRET) com o id do usuário, a versão da conta e a
// validade. Qualquer servidor confere sem depender de memória: na Vercel, cada requisição pode
// cair numa instância diferente, e a sessão guardada só na memória de uma se perdia na outra.
// Sair apaga o cookie; trocar ou perder a senha muda a versão e derruba os cookies antigos.
// Na Fase 11, o Better Auth assume, com sessões no banco.
const PROPOSITO_SESSAO = "sessao";

/** Usuário da sessão atual, ou `null`. Lê o cookie: chamar dentro de <Suspense>. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 1000) return null;
  // Com Cache Components, o relógio só pode ser lido depois de esperar a requisição; sem isto o
  // Next acusa erro ao pré-renderizar o cabeçalho (por exemplo, na página "não encontrado").
  await connection();
  const dados = conferirAssinatura(PROPOSITO_SESSAO, token) as { u?: unknown; v?: unknown } | null;
  if (typeof dados?.u !== "string" || typeof dados.v !== "string") return null;
  if ((await versaoDaSessao(dados.u)) !== dados.v) return null;
  return buscarUsuario(dados.u);
}

async function iniciarSessao(usuarioId: string) {
  const versao = await versaoDaSessao(usuarioId);
  if (!versao) return;
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  const token = assinar(PROPOSITO_SESSAO, { u: usuarioId, v: versao }, DURACAO_SESSAO_MS);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiraEm),
  });
}

/**
 * Confere e-mail e senha e abre a sessão. E-mail inexistente e senha errada dão o mesmo
 * resultado e levam o mesmo tempo (compara com um hash falso), para não revelar quem tem conta.
 */
export async function entrar(email: string, senha: string): Promise<Usuario | null> {
  const usuario = await buscarUsuarioParaLogin(email);
  const confere = senhaConfere(senha, usuario?.senhaHash ?? HASH_FALSO);
  if (!usuario || !confere) return null;
  await iniciarSessao(usuario.id);
  return buscarUsuario(usuario.id);
}

export async function sair() {
  (await cookies()).delete(COOKIE);
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
  await iniciarSessao(usuario.id);
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
  { ok: true; usuario: Usuario } | { ok: false; motivo: "conta_google_diferente" };

/**
 * Entra com o perfil que o Google confirmou. Procura pela conta Google; se não achar, pelo
 * e-mail (o Google verificou que a pessoa é dona dele, então é seguro ligar as contas); se não
 * existir, cria. Quem pediu para vender vira fotógrafo; e-mails em ADMIN_EMAILS viram gestores.
 * Como o e-mail já vem confirmado, as compras feitas como convidado são ligadas à conta.
 */
export async function entrarComGoogle(
  perfil: PerfilGoogle,
  querVender: boolean,
): Promise<ResultadoGoogle> {
  let usuario = await buscarUsuarioPorGoogle(perfil.googleId);
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
  await iniciarSessao(usuario.id);
  const atualizado = await buscarUsuario(usuario.id);
  return atualizado
    ? { ok: true, usuario: atualizado }
    : { ok: false, motivo: "conta_google_diferente" };
}

/** Para onde mandar cada papel depois do login, quando não há um ?proximo=. */
export function inicioDoPapel(papel: Papel) {
  if (papel === "admin" || papel === "atendente") return "/admin";
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
 * Fotógrafo logado e a conta dele, ou redireciona para o login. Usar no topo de toda página
 * e ação do painel: a autorização é conferida em cada uma, não só no menu.
 */
export async function exigirFotografo(proximo = "/painel"): Promise<{
  usuario: Usuario;
  conta: FotografoConta;
}> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect(`/entrar?proximo=${encodeURIComponent(proximo)}`);
  const conta = usuario.papel === "fotografo" ? await buscarContaDoFotografo(usuario.id) : null;
  if (!conta) redirect("/minhas-compras");
  return { usuario, conta };
}

/**
 * Equipe do ClicouAí (gestor ou atendente), ou redireciona. Com `soGestor`, o atendente fica
 * de fora (mudar papéis, por exemplo). Usar no topo de toda página e ação do painel de gestão.
 */
export async function exigirEquipe(proximo = "/admin", soGestor = false): Promise<Usuario> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect(`/entrar?proximo=${encodeURIComponent(proximo)}`);
  const permitido = soGestor
    ? usuario.papel === "admin"
    : usuario.papel === "admin" || usuario.papel === "atendente";
  if (!permitido) redirect(inicioDoPapel(usuario.papel));
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
