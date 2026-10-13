// Cloudflare Stream (docs/arquitetura.md, "Vídeos"): a prévia dos vídeos, inteira e com a marca
// d'água do ClicouAí, tocada no site pelo player do Stream. O original fica no R2 privado e só o
// comprador baixa (como as fotos). O Stream busca o vídeo no R2 por uma URL assinada de leitura
// (ninguém sobe arquivo para ele direto) e aplica o perfil de marca d'água criado uma vez com
// `npm run stream:marca`.
//
// Variáveis: CLOUDFLARE_STREAM_TOKEN (token da API com permissão Stream:Edit),
// CLOUDFLARE_ACCOUNT_ID (sem ela, vale a R2_ACCOUNT_ID: é a mesma conta) e
// CLOUDFLARE_STREAM_MARCA (id do perfil de marca d'água). Sem o token, o envio de vídeo fica
// desligado e o painel avisa.

import "server-only";

const API = "https://api.cloudflare.com/client/v4/accounts";

type ConfigStream = { conta: string; token: string; marca: string | null };

function config(): ConfigStream | null {
  const token = process.env.CLOUDFLARE_STREAM_TOKEN?.trim();
  const conta = (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID)?.trim();
  if (!token || !conta) return null;
  return { conta, token, marca: process.env.CLOUDFLARE_STREAM_MARCA?.trim() || null };
}

export function streamConfigurado() {
  return config() !== null;
}

export class ErroStream extends Error {}

async function chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const c = config();
  if (!c) throw new ErroStream("Cloudflare Stream não configurado.");
  const resposta = await fetch(`${API}/${c.conta}/stream${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  const corpo = (await resposta.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
    errors?: { message?: string }[];
  } | null;
  if (!resposta.ok || !corpo?.success) {
    // Só a mensagem da API: o token nunca entra no erro.
    throw new ErroStream(
      `Stream respondeu ${resposta.status}: ${corpo?.errors?.map((e) => e.message).join("; ") ?? "sem detalhe"}`,
    );
  }
  return corpo.result as T;
}

/**
 * Pede ao Stream para buscar o vídeo (URL assinada de leitura do R2, válida por 1 hora) e
 * prepará-lo com a marca d'água. Devolve o id do vídeo no Stream.
 */
export async function copiarParaStream(url: string, nome: string, fotoId: string) {
  const c = config();
  const resultado = await chamar<{ uid: string }>("/copy", {
    method: "POST",
    body: JSON.stringify({
      url,
      meta: { name: nome, fotoId },
      ...(c?.marca ? { watermark: { uid: c.marca } } : {}),
      thumbnailTimestampPct: 0.3,
    }),
  });
  return resultado.uid;
}

export type SituacaoNoStream =
  | { estado: "processando" }
  | { estado: "erro"; motivo: string }
  | { estado: "pronto"; duracaoS: number; largura: number; altura: number };

export async function situacaoNoStream(uid: string): Promise<SituacaoNoStream> {
  const v = await chamar<{
    readyToStream?: boolean;
    status?: { state?: string; errReasonText?: string };
    duration?: number;
    input?: { width?: number; height?: number };
  }>(`/${encodeURIComponent(uid)}`);
  if (v.status?.state === "error") {
    return { estado: "erro", motivo: v.status.errReasonText || "erro na conversão" };
  }
  if (!v.readyToStream || !v.duration || v.duration <= 0) return { estado: "processando" };
  return {
    estado: "pronto",
    duracaoS: v.duration,
    largura: v.input?.width ?? 0,
    altura: v.input?.height ?? 0,
  };
}

export async function removerDoStream(uid: string) {
  await chamar(`/${encodeURIComponent(uid)}`, { method: "DELETE" }).catch(() => {});
}

/** Quadro do vídeo para a miniatura (sem marca: a nossa marca é posta antes de publicar). */
export function urlDoQuadro(uid: string) {
  return `https://videodelivery.net/${encodeURIComponent(uid)}/thumbnails/thumbnail.jpg?height=1600`;
}

/** Player do Stream (a prévia com marca d'água), para o <iframe> da página do item. */
export function urlDoPlayer(uid: string, poster?: string) {
  const busca = new URLSearchParams({ preload: "metadata", letterboxColor: "black" });
  if (poster) busca.set("poster", poster);
  return `https://iframe.videodelivery.net/${encodeURIComponent(uid)}?${busca}`;
}

/** Cria o perfil de marca d'água a partir de uma imagem pública (script `npm run stream:marca`). */
export async function criarPerfilDeMarca(urlDaImagem: string) {
  return chamar<{ uid: string }>("/watermarks", {
    method: "POST",
    body: JSON.stringify({
      url: urlDaImagem,
      name: "ClicouAí",
      opacity: 0.55,
      padding: 0.05,
      scale: 0.35,
      position: "center",
    }),
  });
}
