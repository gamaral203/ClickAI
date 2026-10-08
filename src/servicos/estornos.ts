import "server-only";

import {
  buscarPedido,
  estornarPedidoNoBanco,
  marcarReembolsoSolicitado,
  restaurarPedidoNoBanco,
  type MotivoEstorno,
  type PedidoInterno,
  type Usuario,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import {
  buscarOrder,
  ErroMercadoPago,
  mercadoPagoConfigurado,
  reembolsarOrder,
  reembolsoJaPedido,
  type OrderMercadoPago,
} from "@/lib/mercadopago";

import { lancamentosDaVenda } from "./pedidos";

// Estorno e chargeback (docs/arquitetura.md, "Estorno e chargeback"). O pedido só muda de status
// pelo que a order diz na API do Mercado Pago (ou pelo gateway simulado, sem credenciais), nunca
// pelo corpo do webhook nem pelo navegador. Efeitos de um estorno:
//   - o pedido sai de `pago`, e os downloads param (src/servicos/downloads.ts);
//   - cada lançamento dos fotógrafos ganha um lançamento negativo. Saque pago ou em
//     processamento nunca é tocado: o negativo é abatido do próximo saque.

/**
 * Reembolso (pelo gestor ou no Mercado Pago) ou chargeback perdido: `estornado`, final. Vale a
 * partir de `pago`, `contestado` (os lançamentos já foram estornados na contestação) e
 * `pendente` (a order foi paga e devolvida antes de o pagamento ser confirmado aqui).
 */
export function estornarPedido(pedidoId: string, motivo: MotivoEstorno) {
  return estornarPedidoNoBanco({
    pedidoId,
    de: ["pendente", "pago", "contestado"],
    para: "estornado",
    motivo,
    agora: new Date(),
  });
}

/**
 * Chargeback aberto: `contestado`. Conservador: os downloads param e os lançamentos são
 * estornados já na abertura, porque o Mercado Pago retém o valor da disputa na conta da
 * plataforma. Se a disputa for perdida, vira `estornado` sem novo lançamento; se for ganha, o
 * gestor restaura (`restaurarContestacao`).
 */
export function contestarPedido(pedidoId: string) {
  return estornarPedidoNoBanco({
    pedidoId,
    de: ["pendente", "pago"],
    para: "contestado",
    motivo: null,
    agora: new Date(),
  });
}

/**
 * Aplica ao pedido o reembolso ou o chargeback que a order (lida na API) mostra. Quem chama já
 * conferiu que a order é a deste pedido. Devolve se a order era de estorno ou contestação.
 */
export async function aplicarEstornoDaOrder(
  pedido: Pick<PedidoInterno, "id" | "status">,
  order: Pick<OrderMercadoPago, "id" | "situacao" | "status" | "statusDetalhe">,
): Promise<boolean> {
  switch (order.situacao) {
    case "reembolsada":
      if (await estornarPedido(pedido.id, "reembolso")) {
        console.warn("Pedido estornado: order reembolsada", { pedido: pedido.id, order: order.id });
      }
      return true;
    case "contestacao_perdida":
      if (await estornarPedido(pedido.id, "chargeback")) {
        console.warn("Pedido estornado: chargeback encerrado contra a plataforma", {
          pedido: pedido.id,
          order: order.id,
          detalhe: order.statusDetalhe,
        });
      }
      return true;
    case "contestada":
      if (await contestarPedido(pedido.id)) {
        console.warn("Pedido em contestação: chargeback aberto", {
          pedido: pedido.id,
          order: order.id,
          detalhe: order.statusDetalhe,
        });
      }
      return true;
    default:
      return false;
  }
}

export type ResultadoReembolso =
  | { ok: true; situacao: "estornado" | "aguardando" }
  | { ok: false; motivo: "inexistente" | "nao_pago" | "sem_cobranca" | "falhou" };

/**
 * O gestor reembolsa um pedido pago, sempre o total. Idempotente: o pedido é marcado antes de
 * chamar o Mercado Pago (os downloads param na hora), a chave de idempotência do reembolso é
 * fixa por pedido, e o estorno só acontece quando a order lida na API diz `reembolsada`. Clicar
 * de novo repete a mesma chamada e não devolve duas vezes.
 */
export async function reembolsarPedido(
  gestor: Pick<Usuario, "id">,
  pedidoId: string,
): Promise<ResultadoReembolso> {
  const encontrado = await buscarPedido(pedidoId);
  if (!encontrado) return { ok: false, motivo: "inexistente" };
  const { pedido } = encontrado;
  if (pedido.status === "estornado") return { ok: true, situacao: "estornado" };
  if (pedido.status !== "pago") return { ok: false, motivo: "nao_pago" };
  // Na produção, reembolso simulado nunca: sem as credenciais do Mercado Pago, o pedido sairia
  // estornado (e o fotógrafo com o lançamento negativo) sem dinheiro devolvido ao cliente.
  if (emProducao() && !mercadoPagoConfigurado()) {
    console.error("Reembolso recusado: Mercado Pago sem credenciais na produção");
    return { ok: false, motivo: "falhou" };
  }

  await marcarReembolsoSolicitado(pedido.id, gestor.id);

  if (!mercadoPagoConfigurado()) {
    // Gateway simulado (sem MP_ACCESS_TOKEN): o reembolso é concluído na hora.
    await estornarPedido(pedido.id, "reembolso");
    return { ok: true, situacao: "estornado" };
  }
  if (!pedido.gatewayId) return { ok: false, motivo: "sem_cobranca" };

  try {
    await reembolsarOrder(pedido.gatewayId, pedido.id);
  } catch (erro) {
    // "Já reembolsada" ou "reembolso em andamento": segue para a leitura da order. Qualquer
    // outra falha (rede, 5xx, recusa) deixa o pedido com o reembolso pedido e os downloads
    // parados; o gestor tenta de novo com a mesma chave de idempotência.
    if (!(erro instanceof ErroMercadoPago && reembolsoJaPedido(erro))) {
      console.error("Falha ao pedir o reembolso ao Mercado Pago", { pedido: pedido.id, erro });
      return { ok: false, motivo: "falhou" };
    }
  }

  try {
    const order = await buscarOrder(pedido.gatewayId);
    if (order.id === pedido.gatewayId && order.referencia === pedido.id) {
      await aplicarEstornoDaOrder(pedido, order);
    }
  } catch (erro) {
    console.error("Falha ao ler a order depois do reembolso", { pedido: pedido.id, erro });
  }
  const depois = await buscarPedido(pedido.id);
  return {
    ok: true,
    situacao: depois?.pedido.status === "estornado" ? "estornado" : "aguardando",
  };
}

export type ResultadoRestauracao =
  | { ok: true }
  | { ok: false; motivo: "inexistente" | "nao_contestado" | "order_nao_paga" | "falhou" };

/**
 * Contestação ganha: o gestor restaura o pedido. Só com a order lida AGORA na API dizendo
 * `processed` + `accredited` e o valor batendo com o pedido. Não é automático no webhook: um
 * aviso antigo ("paga") processado depois do aviso do chargeback restauraria por engano.
 */
export async function restaurarContestacao(pedidoId: string): Promise<ResultadoRestauracao> {
  const encontrado = await buscarPedido(pedidoId);
  if (!encontrado) return { ok: false, motivo: "inexistente" };
  const { pedido, itens } = encontrado;
  if (pedido.status !== "contestado" || !pedido.gatewayId || !mercadoPagoConfigurado()) {
    return { ok: false, motivo: "nao_contestado" };
  }
  try {
    const order = await buscarOrder(pedido.gatewayId);
    if (
      !order.paga ||
      order.referencia !== pedido.id ||
      order.totalCentavos !== pedido.totalCentavos
    ) {
      return { ok: false, motivo: "order_nao_paga" };
    }
  } catch (erro) {
    console.error("Falha ao ler a order para restaurar", { pedido: pedido.id, erro });
    return { ok: false, motivo: "falhou" };
  }
  const agora = Date.now();
  const mudou = await restaurarPedidoNoBanco(
    pedido.id,
    new Date(agora),
    await lancamentosDaVenda(itens, agora),
  );
  return mudou ? { ok: true } : { ok: false, motivo: "nao_contestado" };
}
