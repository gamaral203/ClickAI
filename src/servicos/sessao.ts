import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  apagarSessao,
  buscarSessao,
  buscarUsuario,
  buscarUsuarioParaLogin,
  buscarContaDoFotografo,
  consumirConfirmacaoEmail,
  criarContaDeFotografo,
  criarUsuario,
  emailEmUso,
  marcarEmailConfirmado,
  salvarConfirmacaoEmail,
  salvarSessao,
  slugDeFotografoEmUso,
  vincularPedidosDeConvidado,
  type FotografoConta,
  type Usuario,
} from "@/dados";
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

/** Usuário da sessão atual, ou `null`. Lê o cookie: chamar dentro de <Suspense>. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sessao = await buscarSessao(hash(token));
  if (!sessao || sessao.expiraEm < Date.now()) return null;
  return buscarUsuario(sessao.usuarioId);
}

async function iniciarSessao(usuarioId: string) {
  const token = novoToken();
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  await salvarSessao(hash(token), usuarioId, expiraEm);
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
  const loja = await cookies();
  const token = loja.get(COOKIE)?.value;
  if (token) await apagarSessao(hash(token));
  loja.delete(COOKIE);
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
