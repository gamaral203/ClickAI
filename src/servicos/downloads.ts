import "server-only";

import { buscarItemDoPedido, buscarOriginal, registrarDownload } from "@/dados";
import { emProducao } from "@/db/conexao";
import { r2Configurado, urlDeDownload } from "@/lib/r2";

import { podeAcessar, type Credencial } from "./pedidos";

// Regra central do produto: nenhum original fica acessível sem um pedido pago
// (docs/arquitetura.md, "Download"; docs/riscos.md, trocar o id na URL, prioridade alta).

export type OriginalParaDownload =
  /** Foto enviada: URL assinada do R2 (~15 min), já com Content-Disposition de anexo. */
  | { tipo: "r2"; url: string; nomeArquivo: string }
  /** Dados de exemplo (fora da produção): a imagem de exemplo, entregue pela rota. */
  | { tipo: "exemplo"; url: string; nomeArquivo: string };

/** Onde baixar o original, ou `null` se ele não está disponível. */
async function enderecoDoOriginal(fotoId: string): Promise<OriginalParaDownload | null> {
  const original = await buscarOriginal(fotoId);
  if (!original) return null;
  const { chave, nomeArquivo } = original;
  if (chave.startsWith("originais/")) {
    if (!r2Configurado()) return null;
    return { tipo: "r2", url: await urlDeDownload(chave, nomeArquivo), nomeArquivo };
  }
  // Imagem de exemplo: só fora da produção. Na produção, só original enviado de verdade.
  if (/^https:\/\//.test(chave) && !emProducao()) {
    return { tipo: "exemplo", url: chave, nomeArquivo };
  }
  // Foto ainda em envio (envios/...) ou sem original: não baixa.
  return null;
}

/**
 * Autoriza o download de um item e devolve o original (endereço temporário e nome do
 * arquivo), ou `null`. Só libera item de pedido pago, para quem tem o token do link ou é o
 * cliente logado dono do pedido; pendente, expirado, cancelado ou estornado não baixa.
 */
export async function autorizarDownload(
  itemId: string,
  credencial: Credencial,
  ip: string | null,
): Promise<OriginalParaDownload | null> {
  const encontrado = await buscarItemDoPedido(itemId);
  if (!encontrado) return null;
  const { item, pedido } = encontrado;

  if (!podeAcessar(pedido, credencial)) return null;
  if (pedido.status !== "pago") return null;
  if (pedido.acessoExpiraEm && new Date(pedido.acessoExpiraEm).getTime() < Date.now()) {
    return null;
  }

  const original = await enderecoDoOriginal(item.fotoId);
  if (!original) return null;
  await registrarDownload(item.id, ip);
  return original;
}
