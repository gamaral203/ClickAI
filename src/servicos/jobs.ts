import "server-only";

import {
  apagarSessoesRevogadasVencidas,
  apagarTentativasAntigas,
  buscarPedido,
  listarExpiradosSemLembrete,
  listarFotografosComSaqueProcessando,
  listarPendentesVencidos,
  listarPixParaLembrar,
  marcarLembreteEnviado,
  marcarLembretePix,
  mudarStatusPedido,
} from "@/dados";
import { mercadoPagoConfigurado } from "@/lib/mercadopago";

import { revisarFotosPresas, type ResultadoFotosPresas } from "./envios";
import { enviarLembrete, enviarLembretePix } from "./mensagens";
import { sincronizarPedido } from "./pagamentos";
import { conferirSaques } from "./saques";

// Job de pedidos (docs/arquitetura.md, "Carrinho abandonado"). Na Parte A roda pela rota
// /api/jobs/pedidos; na Fase 13 o Inngest (ou o cron da Vercel) chama de hora em hora.

/** Lembrete só para pedidos recentes: depois disso, a mensagem mais incomoda do que ajuda. */
const JANELA_LEMBRETE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Lembrete do Pix 20 minutos depois de gerar o código (que vale 1 hora). Para ele sair na hora
 * certa, o job precisa rodar a cada poucos minutos (docs/deploy.md, item 6).
 */
const ESPERA_LEMBRETE_PIX_MS = 20 * 60 * 1000;
/**
 * Tentativas (login, cadastro, busca facial, URLs assinadas...) guardadas por um dia, só para o
 * limite; precisa ser maior que a maior janela de src/servicos/limites.ts (1 hora).
 */
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
  // Sessão encerrada cujo cookie já venceu não precisa mais estar na lista.
  await apagarSessoesRevogadasVencidas(agora);
  return resultado;
}

// ---------------------------------------------------------------- Job de revisão

/** Fotógrafos com saque em processamento conferidos por execução (cada um consulta o Payouts). */
const FOTOGRAFOS_COM_SAQUE_POR_VEZ = 20;

export type ResultadoJobRevisao = {
  /** Fotógrafos cujos saques em `processando` foram conferidos no Mercado Pago. */
  saquesConferidos: number;
  fotos: ResultadoFotosPresas;
};

/**
 * Job de revisão (/api/jobs/revisao, a cada 10 minutos pelo GitHub Actions):
 *   1. confere no Mercado Pago os saques em `processando` com o mesmo conferirSaques da página
 *      de vendas: pago vira `pago`, recusa clara no primeiro envio devolve o saldo, e todo caso
 *      ambíguo (sem resposta, recusa num reenvio, Pix devolvido) continua em `processando` para
 *      revisão manual. O saldo nunca volta sem certeza de que o Pix não saiu;
 *   2. revisa fotos presas em `processando` (revisarFotosPresas).
 * Sem o Mercado Pago ou sem o R2 configurados (desenvolvimento e testes), a parte
 * correspondente não faz nada. Uma parte que falha não impede a outra.
 */
export async function rodarJobDeRevisao(agora = Date.now()): Promise<ResultadoJobRevisao> {
  const resultado: ResultadoJobRevisao = {
    saquesConferidos: 0,
    fotos: { revisadas: 0, prontas: 0, comErro: 0 },
  };

  if (mercadoPagoConfigurado()) {
    try {
      for (const fotografoId of await listarFotografosComSaqueProcessando(
        FOTOGRAFOS_COM_SAQUE_POR_VEZ,
      )) {
        try {
          await conferirSaques(fotografoId);
          resultado.saquesConferidos++;
        } catch (erro) {
          console.error(`[jobs] falha ao conferir os saques do fotógrafo ${fotografoId}`, erro);
        }
      }
    } catch (erro) {
      console.error("[jobs] falha ao listar os saques em processamento", erro);
    }
  }

  try {
    resultado.fotos = await revisarFotosPresas(agora);
  } catch (erro) {
    console.error("[jobs] falha ao revisar as fotos presas", erro);
  }
  return resultado;
}
