import "server-only";

import {
  buscarItemDoPedido,
  buscarOriginal,
  registrarDownload,
  type OriginalParaDownload,
} from "@/dados";

import { podeAcessar, type Credencial } from "./pedidos";

// Regra central do produto: nenhum original fica acessível sem um pedido pago
// (docs/arquitetura.md, "Download"; docs/riscos.md, trocar o id na URL, prioridade alta).

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

  const original = await buscarOriginal(item.fotoId);
  if (!original) return null;
  await registrarDownload(item.id, ip);
  return original;
}
