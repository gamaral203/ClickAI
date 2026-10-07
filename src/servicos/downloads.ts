import "server-only";

import { buscarItemDoPedido, gerarUrlDoOriginal, registrarDownload } from "@/dados";

import { tokenConfere } from "./pedidos";

// Regra central do produto: nenhum original fica acessível sem um pedido pago
// (docs/arquitetura.md, "Download"; docs/riscos.md, trocar o id na URL, prioridade alta).

/**
 * Autoriza o download de um item pelo link do convidado e devolve o endereço temporário do
 * original, ou `null`. Só libera item de pedido pago cujo token confere; pedido pendente,
 * expirado, cancelado ou estornado não baixa. Quando houver login (Fase 5), o cliente logado
 * também passa por aqui, com o pedido ligado ao `cliente_id` em vez do token.
 */
export async function autorizarDownload(
  itemId: string,
  token: string,
  ip: string | null,
): Promise<string | null> {
  const encontrado = await buscarItemDoPedido(itemId);
  if (!encontrado) return null;
  const { item, pedido } = encontrado;

  if (!tokenConfere(pedido, token)) return null;
  if (pedido.status !== "pago") return null;
  if (pedido.acessoExpiraEm && new Date(pedido.acessoExpiraEm).getTime() < Date.now()) {
    return null;
  }

  const url = await gerarUrlDoOriginal(item.fotoId);
  if (!url) return null;
  await registrarDownload(item.id, ip);
  return url;
}
