import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { dispositionDeAnexo } from "@/lib/r2";
import {
  autorizarDownload,
  contaComoDownload,
  type OriginalParaDownload,
  registrarDownloadDoFluxo,
} from "@/servicos/downloads";
import { limiteAtingido } from "@/servicos/limites";
import {
  cabecalhosDoOriginalEmFluxo,
  respostaDoOriginalEmFluxo,
} from "@/servicos/original-da-foto";
import { usuarioAtual } from "@/servicos/sessao";
import { respostaDaManutencao } from "@/servicos/manutencao";

/**
 * Teto da função: no R2 a rota só responde um 302, mas o original no Google Drive (evento
 * `hibrido`) passa por aqui em streaming, e um vídeo de 300 MB numa conexão lenta leva minutos.
 */
export const maxDuration = 300;

// Token do link (convidado) ou sessão (cliente logado); um dos dois é conferido no serviço.
const parametros = z.object({ itemId: z.uuid(), token: z.string().min(20).max(400).nullable() });

/** Mesma resposta para todo motivo de recusa, para não revelar se o item ou o pedido existe. */
function indisponivel() {
  return new Response("Download indisponível.", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** A mesma resposta, sem o corpo (para o HEAD). */
function soCabecalhos(resposta: Response) {
  resposta.body?.cancel().catch(() => {});
  return new Response(null, { status: resposta.status, headers: resposta.headers });
}

type Contexto = RouteContext<"/api/download/[itemId]">;

/**
 * Conferências comuns ao GET e ao HEAD: manutenção, parâmetros, limite por IP e o pedido pago
 * (src/servicos/downloads.ts). Devolve a resposta de recusa ou o original autorizado.
 */
async function autorizar(
  request: NextRequest,
  { params }: Contexto,
  opcoes: { registrar: boolean },
): Promise<Response | { original: OriginalParaDownload; ip: string | null }> {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { itemId } = await params;
  const dados = parametros.safeParse({
    itemId,
    token: request.nextUrl.searchParams.get("token"),
  });
  if (!dados.success) return indisponivel();

  // Primeiro IP da cadeia de proxies (a Vercel preenche x-forwarded-for).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  // Limite de URLs assinadas por IP, contado no banco: segura quem tenta varrer ids ou tokens.
  if (await limiteAtingido("url_download_ip", ip ?? "local")) {
    return new Response("Muitos downloads seguidos. Espere alguns minutos e tente de novo.", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const usuario = await usuarioAtual();
  const original = await autorizarDownload(
    dados.data.itemId,
    { token: dados.data.token, clienteId: usuario?.id },
    ip,
    opcoes,
  );
  if (!original) return indisponivel();
  return { original, ip };
}

/** Foto enviada ao R2: 302 para a URL assinada (~15 min); o original não passa pelo Next.js. */
function redirecionarParaR2(url: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest, contexto: Contexto) {
  const autorizado = await autorizar(request, contexto, { registrar: true });
  if (autorizado instanceof Response) return autorizado;
  const { original, ip } = autorizado;

  // Foto enviada: redireciona para a URL assinada do R2 (~15 min), gerada com
  // Content-Disposition de anexo e o nome do arquivo. O original não passa pelo Next.js.
  if (original.tipo === "r2") return redirecionarParaR2(original.url);

  // Original no Google Drive (evento `hibrido`, protótipo): o Drive não tem URL assinada
  // temporária, então a rota repassa o arquivo em streaming (com Range), já autorizada acima.
  // Nada do Drive (id, link) sai na resposta.
  if (original.tipo === "fluxo") {
    const resposta = await respostaDoOriginalEmFluxo({
      foto: original.ref,
      nomeArquivo: original.nomeArquivo,
      tipoMime: original.tipoMime,
      range: request.headers.get("range"),
      operacao: "download_original",
      depois: (tarefa) => after(tarefa),
      sinal: request.signal,
      fotoId: original.fotoId,
      eventoId: original.eventoId,
    });
    if (!resposta) return indisponivel();
    // Um download conta uma vez: o arquivo inteiro (200) ou o primeiro trecho (206 do byte 0).
    if (contaComoDownload(resposta)) await registrarDownloadDoFluxo(original.itemId, ip);
    return resposta;
  }

  // Dados de exemplo (fora da produção): o servidor busca a imagem de exemplo e entrega como
  // anexo, para o navegador salvar o arquivo em vez de abrir a foto numa aba.
  const resposta = await fetch(original.url);
  if (!resposta.ok || !resposta.body) return indisponivel();

  return new Response(resposta.body, {
    headers: {
      "Content-Type": resposta.headers.get("content-type") ?? "image/jpeg",
      "Content-Disposition": dispositionDeAnexo(original.nomeArquivo),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * HEAD próprio: sem ele o Next responde ao HEAD chamando o GET, que abriria o fluxo do Drive sem
 * ninguém ler o corpo (e a medição ficaria esperando o fim). Mesma autorização do GET, só os
 * cabeçalhos, sem abrir o fluxo nem registrar download.
 */
export async function HEAD(request: NextRequest, contexto: Contexto) {
  const autorizado = await autorizar(request, contexto, { registrar: false });
  if (autorizado instanceof Response) return soCabecalhos(autorizado);
  const { original } = autorizado;

  if (original.tipo === "r2") return redirecionarParaR2(original.url);
  if (original.tipo === "fluxo") {
    const resposta = await cabecalhosDoOriginalEmFluxo({
      foto: original.ref,
      nomeArquivo: original.nomeArquivo,
      tipoMime: original.tipoMime,
    });
    return resposta ?? soCabecalhos(indisponivel());
  }
  // Dados de exemplo: os cabeçalhos do anexo, sem buscar a imagem.
  return new Response(null, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": dispositionDeAnexo(original.nomeArquivo),
      "Cache-Control": "no-store",
    },
  });
}
