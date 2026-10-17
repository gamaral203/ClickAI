// Configurações gerais da plataforma e o protótipo de originais no Google Drive (docs/
// arquitetura.md, "Armazenamento"): a trava `armazenamento_experimental`, a conta do Drive
// conectada pela gestão, o cache dos ids das pastas e as medições por provedor.
//
// Só o servidor chama estas funções; a checagem de papel (gestão) fica em cada página e ação.
// O refresh token só entra e sai daqui cifrado (src/lib/segredo-cifrado.ts) e nunca vai a log.

import "server-only";

import { and, avg, count, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { cifrarSegredo } from "@/lib/segredo-cifrado";

import { iso } from "./mapas";

export type ProvedorDoOriginal = (typeof t.provedorOriginal.enumValues)[number];
export type ArmazenamentoDoEvento = (typeof t.modoArmazenamentoOriginais.enumValues)[number];
export type OperacaoDeArmazenamento = (typeof t.operacaoArmazenamento.enumValues)[number];

/** Chave da trava do protótipo do Drive em `configuracoes`: `{ "ativo": boolean }`. */
export const CONFIG_ARMAZENAMENTO_EXPERIMENTAL = "armazenamento_experimental";

/** Finalidade da cifra do refresh token do Drive (src/lib/segredo-cifrado.ts). */
export const FINALIDADE_REFRESH_TOKEN_DRIVE = "google-drive-refresh-token";

/** Nome da pasta raiz no Drive da plataforma. */
export const PASTA_RAIZ_DRIVE = "ClicouAI_Storage";

const LINHA_DA_CREDENCIAL = "principal";
const LIMITE_MENSAGEM = 300;

/**
 * Mensagem de erro curta e sem segredo, para gravar no banco: sem URLs (podem levar parâmetros
 * assinados), sem tokens do Google (`ya29.`, `1//`) nem cabeçalho Bearer, até 300 caracteres.
 */
export function mensagemSemSegredo(erro: unknown): string {
  const bruta =
    erro instanceof Error
      ? `${erro.name}: ${erro.message}`
      : typeof erro === "string"
        ? erro
        : "Erro desconhecido";
  const limpa = bruta
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/bearer\s+\S+/gi, "Bearer [oculto]")
    .replace(/ya29\.[\w.-]+/g, "[token]")
    .replace(/1\/\/[\w.-]+/g, "[token]")
    .replace(/\s+/g, " ")
    .trim();
  return limpa.length > LIMITE_MENSAGEM ? `${limpa.slice(0, LIMITE_MENSAGEM - 1)}…` : limpa;
}

// ---------------------------------------------------------------- Configurações

/** Valor da configuração (JSON), ou `null` se ninguém gravou ainda. */
export async function lerConfiguracao<T = unknown>(chave: string): Promise<T | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ valor: t.configuracoes.valor })
    .from(t.configuracoes)
    .where(eq(t.configuracoes.chave, chave))
    .limit(1);
  return linha ? (linha.valor as T) : null;
}

/** Grava (ou troca) a configuração, com quem mudou e quando. */
export async function gravarConfiguracao(
  chave: string,
  valor: unknown,
  usuarioId: string | null,
): Promise<void> {
  const banco = await obterBanco();
  await banco
    .insert(t.configuracoes)
    .values({ chave, valor, atualizadoPor: usuarioId })
    .onConflictDoUpdate({
      target: t.configuracoes.chave,
      set: { valor, atualizadoPor: usuarioId, atualizadoEm: sql`now()` },
    });
}

/** A trava do protótipo do Drive. Sem linha ou com qualquer outro valor: desligado. */
export async function armazenamentoExperimentalAtivo(): Promise<boolean> {
  const valor = await lerConfiguracao<{ ativo?: unknown }>(CONFIG_ARMAZENAMENTO_EXPERIMENTAL);
  return valor?.ativo === true;
}

// ---------------------------------------------------------------- Credencial do Google Drive

export type ConexaoDrive = {
  contaEmail: string | null;
  escopo: string | null;
  pastaRaizId: string | null;
  conectadoEm: string;
  conectadoPor: string | null;
  ultimoErro: string | null;
  ultimoErroEm: string | null;
  ultimoUsoEm: string | null;
};

/** A conexão com o refresh token ainda cifrado. Só para o servidor; nunca mande ao navegador. */
export type CredencialDrive = ConexaoDrive & { refreshTokenCifrado: string };

function paraConexao(l: typeof t.credenciaisGoogleDrive.$inferSelect): ConexaoDrive {
  return {
    contaEmail: l.contaEmail,
    escopo: l.escopo,
    pastaRaizId: l.pastaRaizId,
    conectadoEm: iso(l.conectadoEm),
    conectadoPor: l.conectadoPor,
    ultimoErro: l.ultimoErro,
    ultimoErroEm: iso(l.ultimoErroEm),
    ultimoUsoEm: iso(l.ultimoUsoEm),
  };
}

async function linhaDaCredencial() {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.credenciaisGoogleDrive)
    .where(eq(t.credenciaisGoogleDrive.chave, LINHA_DA_CREDENCIAL))
    .limit(1);
  return linha ?? null;
}

/** A credencial do Drive, com o refresh token cifrado (src/lib/armazenamento decifra). */
export async function lerCredencialDrive(): Promise<CredencialDrive | null> {
  const linha = await linhaDaCredencial();
  return linha ? { ...paraConexao(linha), refreshTokenCifrado: linha.refreshTokenCifrado } : null;
}

/** A conexão do Drive sem o token, para a tela da gestão. */
export async function situacaoDaConexaoDrive(): Promise<ConexaoDrive | null> {
  const linha = await linhaDaCredencial();
  return linha ? paraConexao(linha) : null;
}

/**
 * Grava a conta do Drive conectada (troca a anterior). Recebe o refresh token EM CLARO e o
 * cifra aqui, para nenhum chamador gravar sem cifrar. Com outra conta (ou a primeira), a pasta
 * raiz e o cache de pastas são esquecidos: os ids da conta anterior não valem na nova.
 */
export async function gravarCredencialDrive(dados: {
  refreshToken: string;
  contaEmail: string | null;
  escopo: string | null;
  usuarioId: string | null;
}): Promise<void> {
  if (!dados.refreshToken) throw new Error("Refresh token do Drive ausente");
  const refreshTokenCifrado = cifrarSegredo(dados.refreshToken, FINALIDADE_REFRESH_TOKEN_DRIVE);
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    const [anterior] = await tx
      .select({ contaEmail: t.credenciaisGoogleDrive.contaEmail })
      .from(t.credenciaisGoogleDrive)
      .where(eq(t.credenciaisGoogleDrive.chave, LINHA_DA_CREDENCIAL))
      .for("update");
    const mesmaConta =
      !!anterior &&
      !!dados.contaEmail &&
      anterior.contaEmail?.toLowerCase() === dados.contaEmail.toLowerCase();
    if (!mesmaConta) await tx.delete(t.pastasDrive);
    const valores = {
      contaEmail: dados.contaEmail,
      refreshTokenCifrado,
      escopo: dados.escopo,
      conectadoPor: dados.usuarioId,
      ultimoErro: null,
      ultimoErroEm: null,
    };
    await tx
      .insert(t.credenciaisGoogleDrive)
      .values({ chave: LINHA_DA_CREDENCIAL, ...valores })
      .onConflictDoUpdate({
        target: t.credenciaisGoogleDrive.chave,
        set: {
          ...valores,
          conectadoEm: sql`now()`,
          ...(mesmaConta ? {} : { pastaRaizId: null, ultimoUsoEm: null }),
        },
      });
  });
}

/** Desconecta o Drive: apaga a credencial e o cache de pastas. Os arquivos no Drive ficam. */
export async function apagarCredencialDrive(): Promise<void> {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx.delete(t.credenciaisGoogleDrive);
    await tx.delete(t.pastasDrive);
  });
}

/**
 * Fotos e vídeos com o original no Drive, em qualquer situação (inclusive os excluídos, que quem
 * comprou continua baixando). Enquanto houver algum, a conta conectada não pode ser trocada nem
 * desconectada: o escopo `drive.file` só enxerga os arquivos da própria conta.
 */
export async function fotosNoDrive(): Promise<number> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ total: count() })
    .from(t.fotos)
    .where(eq(t.fotos.provedorOriginal, "drive"));
  return Number(linha?.total ?? 0);
}

/** Id de um arquivo qualquer gravado no Drive (para conferir se uma conta o enxerga), ou `null`. */
export async function umArquivoNoDrive(): Promise<string | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.fotos.driveArquivoId })
    .from(t.fotos)
    .where(and(eq(t.fotos.provedorOriginal, "drive"), isNotNull(t.fotos.driveArquivoId)))
    .limit(1);
  return linha?.id ?? null;
}

/** Guarda o id da pasta `ClicouAI_Storage` criada (ou achada) no Drive. */
export async function definirPastaRaizDrive(pastaRaizId: string): Promise<void> {
  const banco = await obterBanco();
  await banco
    .update(t.credenciaisGoogleDrive)
    .set({ pastaRaizId })
    .where(eq(t.credenciaisGoogleDrive.chave, LINHA_DA_CREDENCIAL));
}

/**
 * Esquece a pasta raiz (apagada ou na lixeira do Drive) e o cache das pastas, que ficavam dentro
 * dela: o próximo uso acha ou cria `ClicouAI_Storage` de novo.
 */
export async function esquecerPastaRaizDrive(): Promise<void> {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx
      .update(t.credenciaisGoogleDrive)
      .set({ pastaRaizId: null })
      .where(eq(t.credenciaisGoogleDrive.chave, LINHA_DA_CREDENCIAL));
    await tx.delete(t.pastasDrive);
  });
}

/** Último erro do Drive (curto e sem segredo), para a gestão ver. */
export async function registrarErroDrive(mensagem: unknown): Promise<void> {
  const banco = await obterBanco();
  await banco
    .update(t.credenciaisGoogleDrive)
    .set({ ultimoErro: mensagemSemSegredo(mensagem), ultimoErroEm: sql`now()` })
    .where(eq(t.credenciaisGoogleDrive.chave, LINHA_DA_CREDENCIAL));
}

/** Marca o último uso bem-sucedido do Drive. */
export async function registrarUsoDrive(): Promise<void> {
  const banco = await obterBanco();
  await banco
    .update(t.credenciaisGoogleDrive)
    .set({ ultimoUsoEm: sql`now()` })
    .where(eq(t.credenciaisGoogleDrive.chave, LINHA_DA_CREDENCIAL));
}

// ---------------------------------------------------------------- Cache das pastas no Drive

function filtroDaPasta(fotografoId: string, eventoId: string | null) {
  return and(
    eq(t.pastasDrive.fotografoId, fotografoId),
    eventoId === null ? isNull(t.pastasDrive.eventoId) : eq(t.pastasDrive.eventoId, eventoId),
  );
}

/** Id da pasta no Drive do fotógrafo (evento nulo) ou do evento dele, se já está no cache. */
export async function pastaDrive(
  fotografoId: string,
  eventoId: string | null,
): Promise<string | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ driveId: t.pastasDrive.driveId })
    .from(t.pastasDrive)
    .where(filtroDaPasta(fotografoId, eventoId))
    .limit(1);
  return linha?.driveId ?? null;
}

/**
 * Guarda o id da pasta no cache. Se outra chamada gravou antes (corrida), vale a que já estava,
 * e é ela que volta.
 */
export async function gravarPastaDrive(dados: {
  fotografoId: string;
  eventoId: string | null;
  driveId: string;
}): Promise<string> {
  const banco = await obterBanco();
  const [criada] = await banco
    .insert(t.pastasDrive)
    .values(dados)
    .onConflictDoNothing()
    .returning({ driveId: t.pastasDrive.driveId });
  if (criada) return criada.driveId;
  return (await pastaDrive(dados.fotografoId, dados.eventoId)) ?? dados.driveId;
}

/** Tira a pasta do cache (ex.: apagada no Drive); a próxima gravação procura ou cria de novo. */
export async function esquecerPastaDrive(
  fotografoId: string,
  eventoId: string | null,
): Promise<void> {
  const banco = await obterBanco();
  await banco.delete(t.pastasDrive).where(filtroDaPasta(fotografoId, eventoId));
}

// ---------------------------------------------------------------- Métricas por provedor

export async function registrarMetricaArmazenamento(dados: {
  provedor: ProvedorDoOriginal;
  operacao: OperacaoDeArmazenamento;
  duracaoMs: number;
  sucesso: boolean;
  bytes?: number | null;
  /** Erro da operação: gravado só como mensagem curta e sem segredo. */
  erro?: unknown;
  fotoId?: string | null;
  eventoId?: string | null;
}): Promise<void> {
  const banco = await obterBanco();
  await banco.insert(t.metricasArmazenamento).values({
    provedor: dados.provedor,
    operacao: dados.operacao,
    duracaoMs: Math.max(0, Math.round(dados.duracaoMs)),
    sucesso: dados.sucesso,
    bytes: dados.bytes ?? null,
    erro: dados.erro === undefined || dados.erro === null ? null : mensagemSemSegredo(dados.erro),
    fotoId: dados.fotoId ?? null,
    eventoId: dados.eventoId ?? null,
  });
}

type PorProvedor<T> = Record<ProvedorDoOriginal, T>;

export type ResumoMetricasArmazenamento = {
  /** Fotos e vídeos `pronta` (inclusive os excluídos: o original continua guardado). */
  prontasPorProvedor: PorProvedor<number>;
  /** Operações que falharam nos últimos 7 dias. */
  falhas7dPorProvedor: PorProvedor<number>;
  /** Média de duração, em ms, das operações bem-sucedidas nos últimos 7 dias (nulo: nenhuma). */
  mediaUploadMs7d: PorProvedor<number | null>;
  mediaDownloadMs7d: PorProvedor<number | null>;
};

const porProvedor = <T>(valor: T): PorProvedor<T> => ({ r2: valor, drive: valor });

/** Números para comparar R2 e Drive (tudo agregado no banco). */
export async function resumoMetricasArmazenamento(): Promise<ResumoMetricasArmazenamento> {
  const banco = await obterBanco();
  const seteDias = sql`now() - interval '7 days'`;
  const m = t.metricasArmazenamento;
  const [prontas, falhas, medias] = await Promise.all([
    banco
      .select({ provedor: t.fotos.provedorOriginal, total: count() })
      .from(t.fotos)
      .where(eq(t.fotos.status, "pronta"))
      .groupBy(t.fotos.provedorOriginal),
    banco
      .select({ provedor: m.provedor, total: count() })
      .from(m)
      .where(and(eq(m.sucesso, false), gte(m.criadoEm, seteDias)))
      .groupBy(m.provedor),
    banco
      .select({ provedor: m.provedor, operacao: m.operacao, media: avg(m.duracaoMs) })
      .from(m)
      .where(and(eq(m.sucesso, true), gte(m.criadoEm, seteDias)))
      .groupBy(m.provedor, m.operacao),
  ]);
  const resumo: ResumoMetricasArmazenamento = {
    prontasPorProvedor: porProvedor(0),
    falhas7dPorProvedor: porProvedor(0),
    mediaUploadMs7d: porProvedor<number | null>(null),
    mediaDownloadMs7d: porProvedor<number | null>(null),
  };
  for (const l of prontas) resumo.prontasPorProvedor[l.provedor] = Number(l.total);
  for (const l of falhas) resumo.falhas7dPorProvedor[l.provedor] = Number(l.total);
  for (const l of medias) {
    const media = l.media === null ? null : Math.round(Number(l.media));
    if (l.operacao === "upload_original") resumo.mediaUploadMs7d[l.provedor] = media;
    if (l.operacao === "download_original") resumo.mediaDownloadMs7d[l.provedor] = media;
  }
  return resumo;
}

// ---------------------------------------------------------------- Evento

/**
 * Onde gravar os originais das próximas fotos do evento. As já enviadas não mudam. Devolve
 * `false` se o evento não existe.
 */
export async function definirArmazenamentoDoEvento(
  eventoId: string,
  valor: ArmazenamentoDoEvento,
): Promise<boolean> {
  const banco = await obterBanco();
  const alteradas = await banco
    .update(t.eventos)
    .set({ armazenamentoOriginais: valor })
    .where(eq(t.eventos.id, eventoId))
    .returning({ id: t.eventos.id });
  return alteradas.length > 0;
}

export type EventoNoArmazenamento = {
  id: string;
  titulo: string;
  slug: string;
  fotografo: string;
  armazenamento: ArmazenamentoDoEvento;
  /** Fotos e vídeos `pronta` (inclusive os excluídos) por onde o original está gravado. */
  fotosR2: number;
  fotosDrive: number;
};

/**
 * Eventos marcados como híbridos, mais os que voltaram ao R2 mas ainda têm originais no Drive
 * (a gestão precisa saber onde estão). Para a tela de Armazenamento da gestão.
 */
export async function eventosHibridos(): Promise<EventoNoArmazenamento[]> {
  const banco = await obterBanco();
  const e = t.eventos;
  const f = t.fotos;
  const comFotoNoDrive = sql`exists (select 1 from ${f} where ${f.eventoId} = ${e.id} and ${f.provedorOriginal} = 'drive')`;
  const linhas = await banco
    .select({
      id: e.id,
      titulo: e.titulo,
      slug: e.slug,
      fotografo: t.fotografos.nomePublico,
      armazenamento: e.armazenamentoOriginais,
      fotosR2: sql<number>`count(${f.id}) filter (where ${f.provedorOriginal} = 'r2')`.mapWith(
        Number,
      ),
      fotosDrive:
        sql<number>`count(${f.id}) filter (where ${f.provedorOriginal} = 'drive')`.mapWith(Number),
    })
    .from(e)
    .innerJoin(t.fotografos, eq(t.fotografos.id, e.fotografoId))
    .leftJoin(f, and(eq(f.eventoId, e.id), eq(f.status, "pronta")))
    .where(or(eq(e.armazenamentoOriginais, "hibrido"), comFotoNoDrive))
    .groupBy(e.id, t.fotografos.nomePublico)
    .orderBy(e.titulo);
  return linhas;
}

/** Evento pelo endereço, só com o que a tela de Armazenamento precisa; `null` se não existe. */
export async function eventoParaArmazenamento(
  slug: string,
): Promise<{ id: string; titulo: string; armazenamento: ArmazenamentoDoEvento } | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      id: t.eventos.id,
      titulo: t.eventos.titulo,
      armazenamento: t.eventos.armazenamentoOriginais,
    })
    .from(t.eventos)
    .where(eq(t.eventos.slug, slug))
    .limit(1);
  return linha ?? null;
}
