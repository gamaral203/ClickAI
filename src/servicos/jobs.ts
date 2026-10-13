import "server-only";

import {
  apagarCodigosCifradosVencidos,
  apagarCodigosEmailAntigos,
  apagarRedefinicoesVencidas,
  apagarSessoesRevogadasVencidas,
  apagarTentativasAntigas,
  listarExpiradosSemLembrete,
  listarFotografosComSaqueProcessando,
  listarPendentesComCobranca,
  listarPendentesVencidos,
  listarPixParaLembrar,
  marcarLembreteEnviado,
  marcarLembretePix,
  mudarStatusPedido,
} from "@/dados";
import { gatewayConfigurado } from "@/lib/gateway";

import { VALIDADE_CADASTRO_PENDENTE_MS } from "./confirmacao-email";
import { PRAZO_DO_JOB_MS, revisarFotosPresas, type ResultadoFotosPresas } from "./envios";
import { avisarLotesLiberados, enviarLembrete, enviarLembretePix } from "./mensagens";
import { conferirCobrancaDoPedido, type ConferenciaDoPedido } from "./pagamentos";
import { regerarPrevias, type ResultadoRegeracao } from "./regerar-previas";
import { atualizarVideosNoStream } from "./videos";
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
/**
 * Pendentes com cobrança conferidos no gateway por execução (os mais recentes primeiro). Cada um
 * é uma leitura da order na API; o job roda a cada 10 minutos.
 */
const PENDENTES_CONFERIDOS_POR_VEZ = 100;
/** Falhas seguidas na API do gateway que fazem o job parar de conferir nesta execução. */
const FALHAS_SEGUIDAS_PARA_PARAR = 3;

export type ResultadoJobPedidos = {
  /** Pendentes com cobrança conferidos no gateway nesta execução. */
  conferidos: number;
  expirados: number;
  pagos: number;
  lembretes: number;
  lembretesPix: number;
  /** E-mails de lote agendado liberado (ao dono e aos colaboradores). */
  avisosLiberacao: number;
};

export async function rodarJobDePedidos(): Promise<ResultadoJobPedidos> {
  const agora = Date.now();
  const resultado: ResultadoJobPedidos = {
    conferidos: 0,
    expirados: 0,
    pagos: 0,
    lembretes: 0,
    lembretesPix: 0,
    avisosLiberacao: 0,
  };

  // 0. Reconciliação: confere no gateway todo pendente com cobrança, no prazo ou vencido, pelo
  // mesmo caminho do webhook (lê a order na API, confere referência e valor, confirma de forma
  // idempotente). Sem isso, o Pix pago cujo webhook não chegou só era confirmado se o comprador
  // voltasse à página do pedido ou depois que o Pix vencia (docs/riscos.md, prioridade alta).
  const conferidos = new Set<string>();
  let gatewayIndisponivel = false;
  const contar = (conferencia: ConferenciaDoPedido) => {
    resultado.conferidos++;
    if (conferencia === "pago") resultado.pagos++;
    if (conferencia === "expirado") resultado.expirados++;
  };
  if (gatewayConfigurado()) {
    let falhasSeguidas = 0;
    for (const pedido of await listarPendentesComCobranca(PENDENTES_CONFERIDOS_POR_VEZ)) {
      const conferencia = await conferirCobrancaDoPedido(pedido.id);
      conferidos.add(pedido.id);
      contar(conferencia);
      // Gateway fora do ar ou limitando (429): para e tenta de novo na próxima execução.
      falhasSeguidas = conferencia === "falhou" ? falhasSeguidas + 1 : 0;
      if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
        gatewayIndisponivel = true;
        break;
      }
    }
  }

  // 1. Lembrete do Pix ainda dentro do prazo, uma vez por pedido. Vem depois da reconciliação
  // para não lembrar de pagar quem já pagou.
  for (const pedido of await listarPixParaLembrar(agora, ESPERA_LEMBRETE_PIX_MS)) {
    if (!(await marcarLembretePix(pedido.id))) continue;
    await enviarLembretePix(pedido, agora);
    resultado.lembretesPix++;
  }

  // 2. Expira os pendentes vencidos. Com cobrança no gateway, confere lá antes (se a
  // reconciliação ainda não conferiu): o pagamento pode ter chegado sem o webhook.
  for (const pedido of await listarPendentesVencidos(agora)) {
    if (pedido.gatewayId) {
      if (!gatewayConfigurado() || gatewayIndisponivel || conferidos.has(pedido.id)) continue;
      contar(await conferirCobrancaDoPedido(pedido.id));
      continue;
    }
    if (await mudarStatusPedido(pedido.id, "pendente", "expirado")) resultado.expirados++;
  }

  // 3. Lembrete de carrinho abandonado, uma vez por pedido.
  for (const pedido of await listarExpiradosSemLembrete()) {
    if (agora - new Date(pedido.criadoEm).getTime() > JANELA_LEMBRETE_MS) continue;
    if (!(await marcarLembreteEnviado(pedido.id))) continue;
    await enviarLembrete(pedido);
    resultado.lembretes++;
  }

  // 4. Aviso de lote agendado liberado. As fotos já apareceram no minuto certo (a galeria compara
  // o horário na consulta); o job só avisa, uma vez por lote. Uma falha aqui não para o resto.
  try {
    resultado.avisosLiberacao = await avisarLotesLiberados(agora);
  } catch (erro) {
    console.error("[jobs] falha ao avisar os lotes liberados", erro);
  }

  await apagarTentativasAntigas(agora - VALIDADE_TENTATIVAS_MS);
  // Sessão encerrada cujo cookie já venceu não precisa mais estar na lista.
  await apagarSessoesRevogadasVencidas(agora);
  // Cadastros abandonados sem o código e links de "Esqueci a senha" vencidos.
  await apagarCodigosEmailAntigos(agora - VALIDADE_CADASTRO_PENDENTE_MS);
  // O código cifrado (para reenviar o mesmo) só fica enquanto o código vale.
  await apagarCodigosCifradosVencidos(agora);
  await apagarRedefinicoesVencidas(agora);
  return resultado;
}

// ---------------------------------------------------------------- Job de revisão

/** Fotógrafos com saque em processamento conferidos por execução (cada um consulta o Payouts). */
const FOTOGRAFOS_COM_SAQUE_POR_VEZ = 20;
/** Prévias regeradas por execução do job de revisão (no máximo; o prazo costuma parar antes). */
const PREVIAS_REGERADAS_NO_JOB = 300;
/** Abaixo disso de tempo sobrando, o job nem começa a regerar prévias. */
const ESPERA_MINIMA_PARA_REGERAR_MS = 10 * 1000;

export type ResultadoJobRevisao = {
  /** Fotógrafos cujos saques em `processando` foram conferidos no Mercado Pago. */
  saquesConferidos: number;
  fotos: ResultadoFotosPresas;
  /** Prévias regeradas com a marca atual (só quando houve alguma). */
  previas?: ResultadoRegeracao;
  /** Vídeos que o Stream terminou de preparar nesta rodada (só quando houve algum). */
  videos?: { prontos: number; comErro: number };
};

/**
 * Job de revisão (/api/jobs/revisao, a cada 10 minutos pelo GitHub Actions):
 *   1. confere no Mercado Pago os saques em `processando` com o mesmo conferirSaques da página
 *      de vendas: pago vira `pago`, recusa clara no primeiro envio devolve o saldo, e todo caso
 *      ambíguo (sem resposta, recusa num reenvio, Pix devolvido) continua em `processando` para
 *      revisão manual. O saldo nunca volta sem certeza de que o Pix não saiu;
 *   2. revisa fotos presas em `processando` (revisarFotosPresas);
 *   3. com o tempo que sobra, regera as prévias de versão anterior da marca
 *      (src/servicos/regerar-previas.ts), até acabar.
 * Sem o Mercado Pago ou sem o R2 configurados (desenvolvimento e testes), a parte
 * correspondente não faz nada. Uma parte que falha não impede a outra.
 */
export async function rodarJobDeRevisao(agora = Date.now()): Promise<ResultadoJobRevisao> {
  const inicio = Date.now();
  const resultado: ResultadoJobRevisao = {
    saquesConferidos: 0,
    fotos: { revisadas: 0, prontas: 0, comErro: 0 },
  };

  if (gatewayConfigurado()) {
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

  // Vídeos esperando o Cloudflare Stream: os prontos ganham a miniatura e ficam à venda.
  const videos = await atualizarVideosNoStream();
  if (videos.prontos > 0 || videos.comErro > 0) resultado.videos = videos;

  // 3. Com o tempo que sobra, regera as prévias de versão anterior da marca, o evento mais
  // recente primeiro, até acabar (src/servicos/regerar-previas.ts).
  const sobra = PRAZO_DO_JOB_MS - (Date.now() - inicio);
  if (sobra > ESPERA_MINIMA_PARA_REGERAR_MS) {
    try {
      const previas = await regerarPrevias({ limite: PREVIAS_REGERADAS_NO_JOB, prazoMs: sobra });
      if (previas.regeradas > 0 || previas.falhas > 0) resultado.previas = previas;
    } catch (erro) {
      console.error("[jobs] falha ao regerar as prévias", erro);
    }
  }
  return resultado;
}
