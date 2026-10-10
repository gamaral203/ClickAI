import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import {
  buscarUsuario,
  buscarUsuarioParaLogin,
  buscarUsuarioPorGoogle,
  buscarContaDoFotografo,
  apagarCodigoDeLogin,
  apagarCodigoEmail,
  criarContaDeFotografo,
  criarContaDeFotografoSeNaoExistir,
  criarUsuario,
  encerrarTodasAsSessoes,
  ligarContaGoogle,
  mudarPapelDoUsuario,
  revogarSessao,
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
import { inicioDoPapel } from "@/lib/navegacao";
import { HASH_FALSO, senhaConfere } from "@/lib/senha";
import { gerarSlug } from "@/lib/slug";

import {
  conferirCodigoDeLogin,
  enviarCodigoDeLogin,
  exigeCodigoPorEmail,
  reenviarCodigoDeLogin,
  segundosParaReenviarCodigoDeLogin,
  verificacaoPorEmailAtiva,
  type ResultadoEnvioCodigoLogin,
} from "./codigo-login";
import {
  codigoPendente,
  conferirCodigo,
  enviarCodigoParaConta,
  iniciarCadastro,
  reenviarCodigo,
  segundosParaReenviar,
  type ResultadoEnvioCodigo,
} from "./confirmacao-email";
import { conferirCodigoMfa } from "./mfa";

// Sessão própria (docs/arquitetura.md, "Sessão"): cookie HttpOnly assinado, e conta só usável
// com o e-mail confirmado (por código no cadastro com senha, ou pelo Google).

const COOKIE = "clicouai_sessao";
const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Sessão de gestor vale no máximo 12 horas desde o login (expiração absoluta): a conta mexe em
 * reembolsos, papéis e denúncias, e um cookie esquecido num computador vale menos tempo.
 */
export const DURACAO_SESSAO_GESTOR_MS = 12 * 60 * 60 * 1000;

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
  // Conta antiga que nunca confirmou o e-mail: o cookie de antes da confirmação obrigatória não
  // vale mais; ao entrar de novo, a pessoa recebe o código.
  if (!usuario.emailConfirmado) return null;
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

// ---------------------------------------------------------------- Segunda etapa do login
//
// A senha certa (ou a volta do Google) não abre a sessão quando:
//   - a conta é de gestor: um código de 6 dígitos vai para o e-mail da conta
//     (src/servicos/codigo-login.ts), obrigatório;
//   - a verificação em duas etapas está ligada (src/servicos/mfa.ts): código do app autenticador
//     ou de recuperação.
// Um cookie assinado diz quem passou pela primeira etapa (10 minutos com o código por e-mail, 5 só
// com o app), e a sessão só nasce em /entrar/codigo. O gestor com o app ligado pode usar qualquer
// um dos dois códigos. O cookie leva a versão da sessão: trocar a senha ou sair de todos os
// aparelhos também o invalida. Com o código por e-mail, leva ainda o id deste login (`e`), que o
// código no banco também guarda: o código de um login não serve para outro.

const COOKIE_MFA = "clicouai_mfa";
const PROPOSITO_MFA = "mfa_pendente";
const DURACAO_MFA_MS = 5 * 60 * 1000;
const DURACAO_CODIGO_EMAIL_MS = 10 * 60 * 1000;

type DadosMfaPendente = {
  u: string;
  v: string;
  m: MetodoLogin;
  p: string | null;
  /** Id do login que recebeu o código por e-mail (gestor), ou `null`. */
  e?: string | null;
};

async function pedirCodigoMfa(
  usuarioId: string,
  metodo: MetodoLogin,
  proximo: string | null,
  loginId: string | null = null,
) {
  const versao = await versaoDaSessao(usuarioId);
  if (!versao) return;
  const dados: DadosMfaPendente = { u: usuarioId, v: versao, m: metodo, p: proximo, e: loginId };
  const duracao = loginId ? DURACAO_CODIGO_EMAIL_MS : DURACAO_MFA_MS;
  (await cookies()).set(COOKIE_MFA, assinar(PROPOSITO_MFA, dados, duracao), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: duracao / 1000,
  });
}

type SegundaEtapa =
  | { pedeCodigo: false }
  | {
      pedeCodigo: true;
      /** O que houve com o envio do código por e-mail (`null`: só o app autenticador). */
      envio: ResultadoEnvioCodigoLogin | null;
    };

/**
 * Depois da primeira etapa (senha ou Google): decide se o login pede código e, se pedir, manda o
 * código por e-mail (gestor) e grava o cookie da segunda etapa. Na produção sem o Resend, o
 * gestor segue sem o código por e-mail (só com o app, se ligado), com um aviso no log.
 */
async function iniciarSegundaEtapa(
  usuario: Usuario,
  metodo: MetodoLogin,
  proximo: string | null,
): Promise<SegundaEtapa> {
  let loginId: string | null = null;
  let envio: ResultadoEnvioCodigoLogin | null = null;
  if (exigeCodigoPorEmail(usuario)) {
    if (verificacaoPorEmailAtiva()) {
      loginId = randomUUID();
      envio = await enviarCodigoDeLogin(usuario, loginId);
    } else {
      console.warn(
        "[auth] verificação por e-mail dos gestores inativa: configure RESEND_API_KEY e EMAIL_REMETENTE. Gestor entrou sem o código por e-mail.",
      );
    }
  }
  if (!loginId && !usuario.mfaAtivo) return { pedeCodigo: false };
  await pedirCodigoMfa(usuario.id, metodo, proximo, loginId);
  return { pedeCodigo: true, envio };
}

/** Tela do código, com o aviso do que houve com o envio por e-mail (se não saiu). */
export function telaDoCodigoDeLogin(envio: ResultadoEnvioCodigoLogin | null | undefined) {
  if (!envio || envio.ok || envio.motivo === "espera") return "/entrar/codigo";
  return `/entrar/codigo?envio=${envio.motivo === "limite" ? "limite" : "indisponivel"}`;
}

async function lerLoginPendente(): Promise<DadosMfaPendente | null> {
  const token = (await cookies()).get(COOKIE_MFA)?.value;
  if (!token || token.length > 1000) return null;
  await connection();
  const d = conferirAssinatura(PROPOSITO_MFA, token) as Partial<DadosMfaPendente> | null;
  if (
    typeof d?.u !== "string" ||
    typeof d.v !== "string" ||
    (d.m !== "senha" && d.m !== "google") ||
    (d.p !== null && typeof d.p !== "string") ||
    (d.e !== undefined && d.e !== null && typeof d.e !== "string")
  ) {
    return null;
  }
  return { u: d.u, v: d.v, m: d.m, p: d.p ?? null, e: d.e ?? null };
}

export type LoginPendente = {
  usuario: Usuario;
  metodo: MetodoLogin;
  proximo: string | null;
  /** Id do login que recebeu o código por e-mail (gestor), ou `null` (só o app autenticador). */
  loginId: string | null;
};

/** Quem passou pela senha (ou pelo Google) e ainda precisa digitar o código, ou `null`. */
export async function loginPendente(): Promise<LoginPendente | null> {
  const d = await lerLoginPendente();
  if (!d) return null;
  if ((await versaoDaSessao(d.u)) !== d.v) return null;
  const usuario = await buscarUsuario(d.u);
  if (!usuario) return null;
  const loginId = d.e ?? null;
  if (!loginId && !usuario.mfaAtivo) return null;
  return { usuario, metodo: d.m, proximo: d.p, loginId };
}

/** Segundos até poder pedir outro código por e-mail neste login (0: já pode). */
export async function esperaParaReenviarCodigoDeLogin(pendente: LoginPendente): Promise<number> {
  if (!pendente.loginId) return 0;
  return segundosParaReenviarCodigoDeLogin(pendente.usuario.id, pendente.loginId);
}

export type ResultadoCodigoLogin =
  | { ok: true; usuario: Usuario; proximo: string | null }
  | {
      ok: false;
      /**
       * `codigo_vencido`: o código do e-mail venceu (ou foi trocado por um novo);
       * `codigo_bloqueado`: as 5 tentativas do código do e-mail acabaram;
       * `invalido_email_ou_app`: gestor com o app ligado, e nenhum dos dois códigos confere.
       */
      motivo:
        | "expirado"
        | "invalido"
        | "bloqueado"
        | "codigo_vencido"
        | "codigo_bloqueado"
        | "invalido_email_ou_app";
    }
  | { ok: false; motivo: "invalido_email"; restantes: number };

/**
 * Segunda etapa do login: confere o código (do e-mail do gestor ou do app autenticador, com os
 * limites de tentativas) e, se certo, abre a sessão e apaga o cookie da primeira etapa.
 */
export async function concluirLoginComCodigo(codigo: string): Promise<ResultadoCodigoLogin> {
  const pendente = await loginPendente();
  if (!pendente) return { ok: false, motivo: "expirado" };
  const { usuario, loginId } = pendente;
  const texto = codigo.trim().slice(0, 40);

  const abrir = async (): Promise<ResultadoCodigoLogin> => {
    (await cookies()).delete(COOKIE_MFA);
    await iniciarSessao(usuario.id, pendente.metodo);
    return { ok: true, usuario, proximo: pendente.proximo };
  };

  // Código do e-mail: 6 números. Com o app também ligado, um código de recuperação (com letras)
  // vai direto para o app, sem gastar uma tentativa do código do e-mail.
  let porEmail: Awaited<ReturnType<typeof conferirCodigoDeLogin>> | null = null;
  if (loginId && (!usuario.mfaAtivo || /^\d{6}$/.test(texto.replace(/\s/g, "")))) {
    porEmail = await conferirCodigoDeLogin(usuario.id, loginId, texto);
    if (porEmail.ok) return abrir();
  }

  if (usuario.mfaAtivo) {
    const resultado = await conferirCodigoMfa(usuario.id, texto);
    if (resultado === "ok") {
      // O código do e-mail deste login não serve mais.
      if (loginId) await apagarCodigoDeLogin(usuario.id);
      return abrir();
    }
    if (!loginId || resultado === "bloqueado") return { ok: false, motivo: resultado };
    return { ok: false, motivo: "invalido_email_ou_app" };
  }

  if (!porEmail || porEmail.ok) return { ok: false, motivo: "expirado" };
  switch (porEmail.motivo) {
    case "invalido":
      return { ok: false, motivo: "invalido_email", restantes: porEmail.restantes };
    case "bloqueado":
      return { ok: false, motivo: "codigo_bloqueado" };
    default:
      return { ok: false, motivo: "codigo_vencido" };
  }
}

/**
 * "Reenviar código" de /entrar/codigo: código novo por e-mail para o mesmo login (o anterior
 * deixa de valer). Com o código novo, o cookie da primeira etapa ganha mais 10 minutos.
 */
export async function reenviarCodigoDoLoginPendente(): Promise<ResultadoEnvioCodigoLogin> {
  const pendente = await loginPendente();
  if (!pendente?.loginId) return { ok: false, motivo: "sem_login" };
  const resultado = await reenviarCodigoDeLogin(pendente.usuario, pendente.loginId);
  if (resultado.ok) {
    await pedirCodigoMfa(pendente.usuario.id, pendente.metodo, pendente.proximo, pendente.loginId);
  }
  return resultado;
}

export type ResultadoEntrar =
  | {
      usuario: Usuario;
      /**
       * A sessão só abre em /entrar/codigo: conta de gestor (código por e-mail) ou verificação em
       * duas etapas ligada.
       */
      pedeCodigo: boolean;
      /** O que houve com o envio do código por e-mail do gestor (`null`: não houve envio). */
      envioCodigo?: ResultadoEnvioCodigoLogin | null;
      pedeConfirmacao?: false;
    }
  | {
      usuario?: undefined;
      pedeCodigo: false;
      /** O e-mail ainda não foi confirmado: a sessão só abre em /cadastro/codigo. */
      pedeConfirmacao: true;
      /** O que houve com o envio do código (a tela mostra se falhou ou se é preciso esperar). */
      envio: ResultadoEnvioCodigo;
    };

/**
 * Confere e-mail e senha e abre a sessão (ou pede o código: por e-mail, para o gestor; do app, com
 * a verificação em duas etapas ligada). E-mail inexistente e senha errada dão o mesmo resultado e levam o mesmo tempo
 * (compara com um hash falso), para não revelar quem tem conta. Com a senha certa e o e-mail ainda
 * não confirmado (cadastro pendente ou conta antiga), manda o código de confirmação e leva à tela
 * dele: só quem sabe a senha descobre que a conta existe.
 */
export async function entrar(
  email: string,
  senha: string,
  proximo: string | null = null,
): Promise<ResultadoEntrar | null> {
  const usuario = await buscarUsuarioParaLogin(email);
  const pendente = usuario ? null : await codigoPendente(email);
  const confere = senhaConfere(
    senha,
    usuario?.senhaHash ?? pendente?.cadastro?.senhaHash ?? HASH_FALSO,
  );
  if (!confere) return null;
  if (!usuario) {
    if (!pendente?.cadastro) return null;
    // Cadastro que ainda espera o código: volta para a tela do código, com um novo se já pode.
    const envio = await reenviarCodigo(pendente.email);
    await pedirConfirmacaoDoEmail(pendente.email, proximo);
    return { pedeCodigo: false, pedeConfirmacao: true, envio };
  }
  if (usuario.excluidoEm) return null;
  const publico = await buscarUsuario(usuario.id);
  if (!publico) return null;
  if (!publico.emailConfirmado) {
    const envio = await enviarCodigoParaConta(publico);
    await pedirConfirmacaoDoEmail(publico.email, proximo);
    return { pedeCodigo: false, pedeConfirmacao: true, envio };
  }
  const etapa = await iniciarSegundaEtapa(publico, "senha", proximo);
  if (etapa.pedeCodigo) return { usuario: publico, pedeCodigo: true, envioCodigo: etapa.envio };
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

// ---------------------------------------------------------------- Confirmação do e-mail
//
// Depois do cadastro com senha (ou do login de uma conta não confirmada), um cookie assinado de
// 24 horas guarda o e-mail que espera o código e para onde ir depois. Ele só identifica o e-mail
// na tela /cadastro/codigo: quem confirma é o código, que foi só para a caixa de entrada.

const COOKIE_CONFIRMACAO = "clicouai_confirmacao";
const PROPOSITO_CONFIRMACAO = "confirmacao_email";
const DURACAO_CONFIRMACAO_MS = 24 * 60 * 60 * 1000;

type DadosConfirmacao = { e: string; p: string | null };

async function pedirConfirmacaoDoEmail(email: string, proximo: string | null) {
  const dados: DadosConfirmacao = { e: email.trim().toLowerCase(), p: proximo };
  (await cookies()).set(
    COOKIE_CONFIRMACAO,
    assinar(PROPOSITO_CONFIRMACAO, dados, DURACAO_CONFIRMACAO_MS),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DURACAO_CONFIRMACAO_MS / 1000,
    },
  );
}

async function lerConfirmacao(): Promise<DadosConfirmacao | null> {
  const token = (await cookies()).get(COOKIE_CONFIRMACAO)?.value;
  if (!token || token.length > 1000) return null;
  // A assinatura confere a validade com o relógio: com Cache Components, só depois da requisição.
  await connection();
  const d = conferirAssinatura(PROPOSITO_CONFIRMACAO, token) as Partial<DadosConfirmacao> | null;
  if (typeof d?.e !== "string" || (d.p !== null && typeof d.p !== "string")) return null;
  return { e: d.e, p: d.p ?? null };
}

export type ConfirmacaoPendente = {
  email: string;
  /** Segundos até poder pedir outro código (0: já pode). */
  esperaReenvio: number;
};

/** E-mail que espera o código neste aparelho, ou `null` (cookie vencido ou cadastro abandonado). */
export async function confirmacaoPendente(): Promise<ConfirmacaoPendente | null> {
  const dados = await lerConfirmacao();
  if (!dados) return null;
  const linha = await codigoPendente(dados.e);
  if (!linha) return null;
  return { email: linha.email, esperaReenvio: segundosParaReenviar(linha) };
}

/** E-mail do cookie de confirmação (para o reenvio), sem consultar o banco. */
export async function emailAguardandoConfirmacao(): Promise<string | null> {
  return (await lerConfirmacao())?.e ?? null;
}

export type ResultadoCadastro =
  { ok: true } | { ok: false; motivo: "email_em_uso" | "limite" | "indisponivel" };

/**
 * Cadastro com senha: guarda os dados como pendentes, manda o código por e-mail e leva à tela do
 * código (cookie de confirmação). A conta só é criada, e a sessão só abre, com o código certo.
 */
export async function cadastrar(
  dados: { nome: string; email: string; senha: string; papel: "cliente" | "fotografo" },
  proximo: string | null = null,
): Promise<ResultadoCadastro> {
  const resultado = await iniciarCadastro(dados);
  if (!resultado.ok) return resultado;
  await pedirConfirmacaoDoEmail(dados.email, proximo);
  return { ok: true };
}

export type ResultadoConfirmacaoEmail =
  | {
      ok: true;
      usuario: Usuario;
      novo: boolean;
      vinculados: number;
      proximo: string | null;
      /** A verificação em duas etapas está ligada: a sessão só abre em /entrar/codigo. */
      pedeCodigo: boolean;
    }
  | { ok: false; motivo: "invalido"; restantes: number }
  | { ok: false; motivo: "expirado" | "bloqueado" | "sem_cadastro" | "email_em_uso" };

/**
 * Confere o código da tela /cadastro/codigo. Certo: a conta passa a existir (ou fica confirmada),
 * as compras de convidado com o mesmo e-mail são ligadas e a sessão abre (ou, com a verificação
 * em duas etapas ligada, segue para o código do app).
 */
export async function confirmarEmailComCodigo(codigo: string): Promise<ResultadoConfirmacaoEmail> {
  const dados = await lerConfirmacao();
  if (!dados) return { ok: false, motivo: "sem_cadastro" };
  const resultado = await conferirCodigo(dados.e, codigo);
  if (!resultado.ok) return resultado;
  const { usuario } = resultado;
  // O perfil de vendedor nasce com o nome da pessoa; ela completa em /painel/perfil.
  if (resultado.novo && usuario.papel === "fotografo") await garantirContaDeFotografo(usuario);
  (await cookies()).delete(COOKIE_CONFIRMACAO);
  // Gestor com o e-mail ainda não confirmado: o código que acabou de digitar já veio do e-mail da
  // conta, depois da senha certa, então vale como a etapa do e-mail.
  if (usuario.mfaAtivo) {
    await pedirCodigoMfa(usuario.id, "senha", dados.p);
    return { ...resultado, proximo: dados.p, pedeCodigo: true };
  }
  await iniciarSessao(usuario.id, "senha");
  return { ...resultado, proximo: dados.p, pedeCodigo: false };
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

  // O Google confirmou o e-mail: um cadastro com senha que esperava o código perde o sentido.
  await apagarCodigoEmail(usuario.email);
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

// Para onde mandar cada papel depois do login: função pura em src/lib/navegacao.ts.
export { inicioDoPapel };

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
  return garantirContaDeFotografo(usuario);
}

/**
 * Conta de fotógrafo do usuário, criada com o nome dele se ainda não existir. Requisições ao
 * mesmo tempo não criam duas (fotografos.usuario_id é único), e dois fotógrafos com o mesmo nome
 * ganham slugs diferentes: quem perde a corrida pelo slug tenta o próximo.
 */
async function garantirContaDeFotografo(
  usuario: Pick<Usuario, "id" | "nome">,
): Promise<FotografoConta> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const existente = await buscarContaDoFotografo(usuario.id);
    if (existente) return existente;
    const criada = await criarContaDeFotografoSeNaoExistir({
      usuarioId: usuario.id,
      nomePublico: usuario.nome,
      slug: await slugDisponivel(usuario.nome),
    });
    if (criada) return criada;
  }
  throw new Error("Não foi possível criar a conta de fotógrafo.");
}

/**
 * "Quero vender": o cliente logado passa a fotógrafo e ganha o perfil de vendedor, como no login
 * com o Google pelo botão de vender. Serve para quem criou a conta como comprador e depois quer
 * vender (ou marcou o tipo errado no cadastro), sem precisar de outro e-mail. Gestor e fotógrafo
 * ficam como estão. Conta de fotógrafo não compra: para comprar depois, a pessoa sai da conta.
 * Devolve se o usuário pode usar o painel depois disso.
 */
export async function comecarAVender(usuario: Usuario): Promise<boolean> {
  if (usuario.papel !== "cliente") return podeUsarPainel(usuario);
  await garantirContaDeFotografo(usuario);
  return mudarPapelDoUsuario(usuario.id, "fotografo");
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
  // Cliente no painel: a página de cadastro oferece passar a conta para fotógrafo.
  if (!conta) redirect("/cadastro?tipo=fotografo");
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
