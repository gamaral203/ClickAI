// Pedidos de exemplo, guardados na memória do servidor (Parte A). Somem quando o servidor
// reinicia; na Fase 11 vão para o banco.

import type { Download, ItemPedido, Lancamento, Mensagem, PedidoInterno, Saque } from "../tipos";
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

// Chave própria: um servidor de desenvolvimento já rodando continua com as coleções acima e
// ganha esta sem precisar reiniciar.
export const saques = compartilhado("saques-exemplo", () => [] as Saque[]);

/** Caixa de saída das mensagens simuladas (e-mail e WhatsApp). */
export const mensagens = compartilhado("mensagens-exemplo", () => [] as Mensagem[]);
