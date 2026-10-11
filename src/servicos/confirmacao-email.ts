import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import {
  atualizarCadastroPendente,
  buscarCodigoEmail,
  buscarUsuario,
  consumirCodigoEmail,
  contarTentativaDoCodigo,
  criarUsuarioSeEmailLivre,
  emailEmUso,
  gravarCodigoEmail,
  liberarReenvioDoCodigo,
  marcarEmailConfirmado,
  renovarEnvioDoCodigoEmail,
  vincularPedidosDeConvidado,
  type CadastroPendente,
  type CodigoEmail,
  type Papel,
  type Usuario,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { derivarChave } from "@/lib/assinatura";
import { cifrarCodigo, decifrarCodigo } from "@/lib/codigo-cifrado";
import { emailConfigurado } from "@/lib/email";
import { gerarHashSenha } from "@/lib/senha";

import { limiteAtingido, limiteDoIpAtingido } from "./limites";
import { enviarCodigoDeConfirmacao } from "./mensagens";

// Confirmação do e-mail por código de 6 dígitos (docs/arquitetura.md, "Cadastro e confirmação do
// e-mail"). O cadastro com senha não cria a conta: nome, hash da senha e tipo de conta esperam em
// `codigos_email` até o código certo. Assim, quem desiste não prende o e-mail (o cadastro pendente
// vence em 24 horas e pode ser refeito a qualquer momento), e ninguém usa uma conta com o e-mail
// de outra pessoa. Contas antigas, criadas antes da confirmação obrigatória, recebem o código ao
// entrar com a senha certa (src/servicos/sessao.ts).
//
// Um código por vez: enquanto o código vale (não usado, não vencido, com tentativas sobrando),
// "Reenviar", um novo login ou refazer o cadastro mandam o MESMO código, então todo e-mail que
// chegar traz o mesmo número e não há o que adivinhar. Para isso o código fica cifrado na linha
// (src/lib/codigo-cifrado.ts) só enquanto vale; a conferência continua pelo HMAC. As tentativas
// não zeram no reenvio (senão cada reenvio daria mais 5 chutes no mesmo código). Outro envio em
// menos de 30 segundos não sai (clique duplo, tela recarregada).

export const TAMANHO_CODIGO = 6;
/** Validade do código (2 horas desde que foi gerado; os reenvios mandam o mesmo, sem estender). */
export const VALIDADE_CODIGO_MS = 2 * 60 * 60 * 1000;
/** Teto absoluto da validade de um código, mesmo com reenvios. */
export const TETO_CODIGO_MS = 2 * 60 * 60 * 1000;
/** Outro envio antes disso não sai (o mesmo código acabou de ser mandado). */
export const ESPERA_REENVIO_MS = 30 * 1000;
export const MAXIMO_TENTATIVAS_CODIGO = 5;
/** O cadastro pendente (e o código de uma conta antiga) some depois disso. */
export const VALIDADE_CADASTRO_PENDENTE_MS = 24 * 60 * 60 * 1000;

/** Código aleatório de 6 dígitos (gerador criptográfico). */
export function gerarCodigo(): string {
  return randomInt(0, 10 ** TAMANHO_CODIGO)
    .toString()
    .padStart(TAMANHO_CODIGO, "0");
}

/** HMAC do código com o e-mail (chave derivada do APP_SECRET): o banco nunca vê o código. */
export function hashDoCodigo(email: string, codigo: string): string {
  return createHmac("sha256", derivarChave("codigo-confirmacao-email"))
    .update(`${email.trim().toLowerCase()}:${codigo}`)
    .digest("hex");
}

function mesmoHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Dá para mandar o código? Na produção, só com o Resend configurado; fora dela, o código aparece
 * no log do servidor (src/servicos/mensagens.ts). Na produção sem o Resend, o cadastro com senha
 * falha com uma mensagem clara, em vez de liberar uma conta sem confirmar.
 */
export function podeEnviarCodigo(): boolean {
  return emailConfigurado() || !emProducao();
}

/** Linha válida do e-mail, ou `null` se não existe ou é um cadastro pendente vencido. */
export async function codigoPendente(
  email: string,
  agora = Date.now(),
): Promise<CodigoEmail | null> {
  const linha = await buscarCodigoEmail(email);
  if (!linha) return null;
  if (agora - linha.criadoEm > VALIDADE_CADASTRO_PENDENTE_MS) return null;
  if (!linha.usuarioId && !linha.cadastro) return null;
  return linha;
}

/** Segundos que ainda faltam para poder reenviar o código (0: já pode). */
export function segundosParaReenviar(linha: Pick<CodigoEmail, "enviadoEm">, agora = Date.now()) {
  return Math.max(0, Math.ceil((linha.enviadoEm + ESPERA_REENVIO_MS - agora) / 1000));
}

export type ResultadoEnvioCodigo =
  | {
      ok: true;
      /** `true`: mandou de novo o mesmo código que já valia; `false`: código novo. */
      mesmo: boolean;
      enviadoEm: number;
      expiraEm: number;
    }
  | { ok: false; motivo: "espera"; segundos: number }
  | { ok: false; motivo: "limite" | "indisponivel" | "sem_cadastro" };

const FINALIDADE = "confirmacao-email";

/**
 * O código desta linha ainda pode ser reenviado? Não usado (a linha existe), não vencido, com
 * tentativas sobrando, dentro do teto, do mesmo dono e com o cifrado legível e conferindo com o
 * HMAC. Devolve o código em claro (só em memória) e quando foi gerado.
 */
function codigoReaproveitavel(
  linha: CodigoEmail,
  usuarioId: string | null,
  agora: number,
): { codigo: string; geradoEm: number } | null {
  if (linha.tentativas >= MAXIMO_TENTATIVAS_CODIGO) return null;
  if (linha.codigoExpiraEm <= agora) return null;
  if (linha.codigoGeradoEm === null || linha.codigoGeradoEm + TETO_CODIGO_MS <= agora) return null;
  if (linha.usuarioId !== usuarioId) return null;
  const codigo = decifrarCodigo(linha.codigoCifrado, FINALIDADE, linha.email);
  if (!codigo || !mesmoHash(linha.codigoHash, hashDoCodigo(linha.email, codigo))) return null;
  return { codigo, geradoEm: linha.codigoGeradoEm };
}

/**
 * Manda o código para o e-mail: o MESMO, se o anterior ainda vale; senão, um novo. Outro envio em
 * menos de 30 segundos não sai (`espera`: o código acabou de ser mandado). Respeita os limites
 * por e-mail e por IP, que contam também o reenvio do mesmo código (cota de e-mails).
 */
async function enviarCodigo(
  alvo: {
    email: string;
    nome: string;
    usuarioId: string | null;
    cadastro: CadastroPendente | null;
    /** Cadastro refeito: recomeça a validade de 24 horas. */
    renovar: boolean;
  },
  agora: number,
): Promise<ResultadoEnvioCodigo> {
  if (!podeEnviarCodigo()) return { ok: false, motivo: "indisponivel" };
  const anterior = await buscarCodigoEmail(alvo.email);
  if (anterior) {
    const segundos = segundosParaReenviar(anterior, agora);
    if (segundos > 0) return { ok: false, motivo: "espera", segundos };
  }
  const [porEmail, porIp] = await Promise.all([
    limiteAtingido("codigo_email_envio_email", alvo.email),
    limiteDoIpAtingido("codigo_email_envio_ip"),
  ]);
  if (porEmail || porIp) return { ok: false, motivo: "limite" };
  const espera = { ok: false, motivo: "espera", segundos: ESPERA_REENVIO_MS / 1000 } as const;

  const email = alvo.email.trim().toLowerCase();
  const mesmo = anterior ? codigoReaproveitavel(anterior, alvo.usuarioId, agora) : null;
  let codigo: string;
  let expiraEm: number;
  if (mesmo && anterior) {
    codigo = mesmo.codigo;
    expiraEm = Math.min(agora + VALIDADE_CODIGO_MS, mesmo.geradoEm + TETO_CODIGO_MS);
    const renovou = await renovarEnvioDoCodigoEmail({
      email,
      codigoHash: anterior.codigoHash,
      usuarioId: alvo.usuarioId,
      cadastro: alvo.cadastro,
      codigoExpiraEm: expiraEm,
      agora,
      esperaMs: ESPERA_REENVIO_MS,
      maximoTentativas: MAXIMO_TENTATIVAS_CODIGO,
      renovar: alvo.renovar,
    });
    // Outro envio ao mesmo tempo (clique duplo) já mandou o mesmo código.
    if (!renovou) return espera;
  } else {
    codigo = gerarCodigo();
    expiraEm = agora + VALIDADE_CODIGO_MS;
    const gravou = await gravarCodigoEmail({
      email,
      usuarioId: alvo.usuarioId,
      cadastro: alvo.cadastro,
      codigoHash: hashDoCodigo(email, codigo),
      codigoCifrado: cifrarCodigo(codigo, FINALIDADE, email),
      codigoExpiraEm: expiraEm,
      agora,
      esperaMs: ESPERA_REENVIO_MS,
      renovar: alvo.renovar,
    });
    // Outro envio ao mesmo tempo (clique duplo) gravou e mandou o código.
    if (!gravou) return espera;
  }
  if (!(await enviarCodigoDeConfirmacao(email, alvo.nome, codigo, expiraEm))) {
    await liberarReenvioDoCodigo(email);
    return { ok: false, motivo: "indisponivel" };
  }
  return { ok: true, mesmo: Boolean(mesmo), enviadoEm: agora, expiraEm };
}

export type ResultadoInicioCadastro =
  { ok: true } | { ok: false; motivo: "email_em_uso" | "limite" | "indisponivel" };

/**
 * Cadastro com senha: guarda os dados como pendentes e manda o código. A conta só nasce com o
 * código certo (conferirCodigo). Refazer o cadastro troca os dados e manda o mesmo código, se ainda
 * vale (dentro dos 30 segundos do último envio, não manda outro e-mail).
 */
export async function iniciarCadastro(
  dados: { nome: string; email: string; senha: string; papel: "cliente" | "fotografo" },
  agora = Date.now(),
): Promise<ResultadoInicioCadastro> {
  if (await emailEmUso(dados.email)) return { ok: false, motivo: "email_em_uso" };
  if (!podeEnviarCodigo()) return { ok: false, motivo: "indisponivel" };
  const email = dados.email.trim().toLowerCase();
  const cadastro = { nome: dados.nome, senhaHash: gerarHashSenha(dados.senha), papel: dados.papel };
  const resultado = await enviarCodigo(
    { email, nome: dados.nome, usuarioId: null, cadastro, renovar: true },
    agora,
  );
  if (resultado.ok) return { ok: true };
  if (resultado.motivo === "espera") {
    await atualizarCadastroPendente(email, cadastro);
    return { ok: true };
  }
  if (resultado.motivo === "sem_cadastro") return { ok: false, motivo: "indisponivel" };
  return { ok: false, motivo: resultado.motivo };
}

/**
 * Conta antiga ainda não confirmada que acabou de acertar a senha: manda o código (se já não
 * mandou nos últimos 30 segundos): o mesmo, se o anterior ainda vale.
 */
export async function enviarCodigoParaConta(
  usuario: Pick<Usuario, "id" | "email" | "nome">,
  agora = Date.now(),
): Promise<ResultadoEnvioCodigo> {
  return enviarCodigo(
    {
      email: usuario.email,
      nome: usuario.nome,
      usuarioId: usuario.id,
      cadastro: null,
      renovar: true,
    },
    agora,
  );
}

/** "Reenviar código" da tela do código. */
export async function reenviarCodigo(
  email: string,
  agora = Date.now(),
): Promise<ResultadoEnvioCodigo> {
  const linha = await codigoPendente(email, agora);
  if (!linha) return { ok: false, motivo: "sem_cadastro" };
  const nome =
    linha.cadastro?.nome ?? (linha.usuarioId ? (await buscarUsuario(linha.usuarioId))?.nome : null);
  if (!nome) return { ok: false, motivo: "sem_cadastro" };
  return enviarCodigo(
    {
      email: linha.email,
      nome,
      usuarioId: linha.usuarioId,
      cadastro: linha.cadastro,
      renovar: false,
    },
    agora,
  );
}

export type ResultadoConferencia =
  | { ok: true; usuario: Usuario; novo: boolean; papel: Papel; vinculados: number }
  | { ok: false; motivo: "invalido"; restantes: number }
  | { ok: false; motivo: "expirado" | "bloqueado" | "sem_cadastro" | "email_em_uso" };

/**
 * Confere o código. Certo: cria a conta do cadastro pendente (ou marca a conta antiga como
 * confirmada), liga as compras feitas como convidado com o mesmo e-mail e devolve o usuário; a
 * sessão é aberta por quem chamou (src/servicos/sessao.ts). Errado: conta uma tentativa; na
 * quinta, o código deixa de valer e só um código novo serve.
 */
export async function conferirCodigo(
  email: string,
  codigo: string,
  agora = Date.now(),
): Promise<ResultadoConferencia> {
  const linha = await codigoPendente(email, agora);
  if (!linha) return { ok: false, motivo: "sem_cadastro" };
  if (linha.tentativas >= MAXIMO_TENTATIVAS_CODIGO) return { ok: false, motivo: "bloqueado" };
  if (linha.codigoExpiraEm <= agora) return { ok: false, motivo: "expirado" };

  const tentativa = await contarTentativaDoCodigo(linha.email, MAXIMO_TENTATIVAS_CODIGO);
  if (!tentativa) return { ok: false, motivo: "bloqueado" };
  const digitado = codigo.replace(/\D/g, "");
  if (
    digitado.length !== TAMANHO_CODIGO ||
    !mesmoHash(tentativa.codigoHash, hashDoCodigo(linha.email, digitado))
  ) {
    const restantes = MAXIMO_TENTATIVAS_CODIGO - tentativa.tentativas;
    return restantes > 0
      ? { ok: false, motivo: "invalido", restantes }
      : { ok: false, motivo: "bloqueado" };
  }

  // Uso único: só quem apagar a linha com este código segue (dois envios ao mesmo tempo, ou um
  // reenvio no meio, não confirmam duas vezes).
  const usada = await consumirCodigoEmail(linha.email, tentativa.codigoHash);
  if (!usada) return { ok: false, motivo: "expirado" };

  let usuario: Usuario | null;
  let novo = false;
  if (usada.usuarioId) {
    await marcarEmailConfirmado(usada.usuarioId);
    usuario = await buscarUsuario(usada.usuarioId);
    if (!usuario) return { ok: false, motivo: "sem_cadastro" };
  } else if (usada.cadastro) {
    usuario = await criarUsuarioSeEmailLivre({
      nome: usada.cadastro.nome,
      email: usada.email,
      senhaHash: usada.cadastro.senhaHash,
      papel: usada.cadastro.papel,
      emailConfirmado: true,
    });
    // O e-mail ganhou conta enquanto o código esperava (ex.: entrou com o Google).
    if (!usuario) return { ok: false, motivo: "email_em_uso" };
    novo = true;
  } else {
    return { ok: false, motivo: "sem_cadastro" };
  }
  const vinculados = await vincularPedidosDeConvidado(usuario.id);
  return { ok: true, usuario, novo, papel: usuario.papel, vinculados };
}
