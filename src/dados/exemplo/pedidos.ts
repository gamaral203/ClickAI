// Pedidos de exemplo, guardados na memória do servidor (Parte A). Somem quando o servidor
// reinicia e não são compartilhados entre instâncias; na Fase 11 vão para o banco.

import type { ItemPedido, Lancamento, PedidoInterno } from "../tipos";

type Armazenamento = {
  pedidos: Map<string, PedidoInterno>;
  itensPorPedido: Map<string, ItemPedido[]>;
  lancamentos: Lancamento[];
};

// No globalThis porque o Next pode carregar este módulo mais de uma vez (por rota e a cada
// recarga em desenvolvimento), e cada cópia teria o seu próprio Map.
const global = globalThis as typeof globalThis & { __clicouaiPedidos?: Armazenamento };
global.__clicouaiPedidos ??= { pedidos: new Map(), itensPorPedido: new Map(), lancamentos: [] };

export const { pedidos, itensPorPedido, lancamentos } = global.__clicouaiPedidos;
