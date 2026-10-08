import "server-only";

import {
  apagarTentativasAntigas,
  buscarPedido,
  listarExpiradosSemLembrete,
  listarPendentesVencidos,
  listarPixParaLembrar,
  marcarLembreteEnviado,
  marcarLembretePix,
  mudarStatusPedido,
} from "@/dados";
import { mercadoPagoConfigurado } from "@/lib/mercadopago";

import { enviarLembrete, enviarLembretePix } from "./mensagens";
import { sincronizarPedido } from "./pagamentos";

// Job de pedidos (docs/arquitetura.md, "Carrinho abandonado"). Na Parte A roda pela rota
// /api/jobs/pedidos; na Fase 13 o Inngest (ou o cron da Vercel) chama de hora em hora.

/** Lembrete só para pedidos recentes: depois disso, a mensagem mais incomoda do que ajuda. */
const JANELA_LEMBRETE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Lembrete do Pix 20 minutos depois de gerar o código (que vale 1 hora). Para ele sair na hora
 * certa, o job precisa rodar a cada poucos minutos (docs/deploy.md, item 6).
 */
const ESPERA_LEMBRETE_PIX_MS = 20 * 60 * 1000;
/** Tentativas de login e cadastro guardadas por um dia, só para o limite. */
const VALIDADE_TENTATIVAS_MS = 24 * 60 * 60 * 1000;

export type ResultadoJobPedidos = {
  expirados: number;
  pagos: number;
  lembretes: number;
  lembretesPix: number;
};

export async function rodarJobDePedidos(): Promise<ResultadoJobPedidos> {
  const agora = Date.now();
  const resultado: ResultadoJobPedidos = { expirados: 0, pagos: 0, lembretes: 0, lembretesPix: 0 };

  // 0. Lembrete do Pix ainda dentro do prazo, uma vez por pedido.
  for (const pedido of await listarPixParaLembrar(agora, ESPERA_LEMBRETE_PIX_MS)) {
    if (!(await marcarLembretePix(pedido.id))) continue;
    await enviarLembretePix(pedido, agora);
    resultado.lembretesPix++;
  }

  // 1. Expira os pendentes vencidos. Com cobrança no Mercado Pago, confere lá antes: o
  // pagamento pode ter chegado sem o webhook (docs/riscos.md, prioridade alta).
  for (const pedido of await listarPendentesVencidos(agora)) {
    if (pedido.gatewayId) {
      if (!mercadoPagoConfigurado()) continue;
      await sincronizarPedido(pedido);
      const status = (await buscarPedido(pedido.id))?.pedido.status;
      if (status === "pago") resultado.pagos++;
      if (status === "expirado") resultado.expirados++;
      continue;
    }
    if (await mudarStatusPedido(pedido.id, "pendente", "expirado")) resultado.expirados++;
  }

  // 2. Lembrete de carrinho abandonado, uma vez por pedido.
  for (const pedido of await listarExpiradosSemLembrete()) {
    if (agora - new Date(pedido.criadoEm).getTime() > JANELA_LEMBRETE_MS) continue;
    if (!(await marcarLembreteEnviado(pedido.id))) continue;
    await enviarLembrete(pedido);
    resultado.lembretes++;
  }

  await apagarTentativasAntigas(agora - VALIDADE_TENTATIVAS_MS);
  return resultado;
}
