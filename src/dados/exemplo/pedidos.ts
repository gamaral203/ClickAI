// Pedidos de exemplo, guardados na memória do servidor (Parte A). Somem quando o servidor
// reinicia; na Fase 11 vão para o banco.

import type { Download, ItemPedido, Lancamento, PedidoInterno } from "../tipos";
import { compartilhado } from "./compartilhado";

export const { pedidos, itensPorPedido, lancamentos, downloads } = compartilhado(
  "pedidos-exemplo",
  () => ({
    pedidos: new Map<string, PedidoInterno>(),
    itensPorPedido: new Map<string, ItemPedido[]>(),
    lancamentos: [] as Lancamento[],
    downloads: [] as Download[],
  }),
);
