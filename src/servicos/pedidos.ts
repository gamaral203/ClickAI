import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  buscarItensParaCompra,
  buscarPedido,
  buscarRegrasDeDivisao,
  mudarStatusPedido,
  salvarLancamentos,
  salvarPedido,
  type ItemPedido,
  type Lancamento,
  type MetodoPagamento,
  type PedidoInterno,
  type RegraDeDivisao,
} from "@/dados";

// Regras de pedido (docs/arquitetura.md, "Compra e pagamento" e "Divisão da venda").

/** O Pix (e o pedido pendente) expira em 1 hora. */
const VALIDADE_PEDIDO_MS = 60 * 60 * 1000;
/** Prazo para o dinheiro ficar disponível ao fotógrafo: Pix na hora, cartão em 30 dias. */
const PRAZO_DISPONIVEL_MS: Record<MetodoPagamento, number> = {
  pix: 0,
  cartao: 30 * 24 * 60 * 60 * 1000,
};

export type DadosComprador = {
  nome: string;
  email: string;
  whatsapp: string | null;
  aceitaWhatsapp: boolean;
  metodo: MetodoPagamento;
};

/**
 * Divide o preço de um item. A plataforma fica com a comissão; do restante, se o autor é um
 * colaborador, o dono do evento fica com a parte dele. Os centavos de arredondamento ficam com
 * o autor, e a soma sempre fecha com o preço (docs/riscos.md, divisão perde centavos).
 */
export function dividirItem(precoCentavos: number, regra: RegraDeDivisao) {
  const plataforma = Math.floor((precoCentavos * regra.comissaoPlataformaPct) / 100);
  const restante = precoCentavos - plataforma;
  const dono =
    regra.autorId === regra.donoEventoId ? 0 : Math.floor((restante * regra.comissaoDonoPct) / 100);
  return {
    valorPlataformaCentavos: plataforma,
    valorDonoEventoCentavos: dono,
    valorFotografoCentavos: restante - dono,
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** O token do link bate com o hash guardado no pedido? Compara em tempo constante. */
export function tokenConfere(pedido: Pick<PedidoInterno, "tokenAcessoHash">, token: string) {
  if (!pedido.tokenAcessoHash) return false;
  const esperado = Buffer.from(pedido.tokenAcessoHash, "hex");
  const recebido = Buffer.from(hashToken(token), "hex");
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

export type ResultadoCriarPedido =
  | { ok: true; pedidoId: string; token: string }
  | { ok: false; motivo: "carrinho_vazio" | "itens_indisponiveis" };

/**
 * Cria o pedido como `pendente` a partir dos ids do carrinho, com preço e divisão calculados
 * aqui. Devolve o token de acesso do convidado uma única vez; o pedido guarda só o hash.
 */
export async function criarPedido(
  ids: string[],
  comprador: DadosComprador,
): Promise<ResultadoCriarPedido> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return { ok: false, motivo: "carrinho_vazio" };

  const itensVenda = await buscarItensParaCompra(unicos);
  // Se algo saiu de venda entre o carrinho e o checkout, a pessoa revisa antes de pagar.
  if (itensVenda.length !== unicos.length) return { ok: false, motivo: "itens_indisponiveis" };

  const regras = await buscarRegrasDeDivisao(unicos);
  const agora = Date.now();
  const pedidoId = randomUUID();
  const token = randomBytes(32).toString("base64url");

  const itens: ItemPedido[] = itensVenda.map(({ foto, precoCentavos }) => {
    const regra = regras.find((r) => r.fotoId === foto.id);
    if (!regra) throw new Error(`Sem regra de divisão para ${foto.id}`);
    return {
      id: randomUUID(),
      pedidoId,
      fotoId: foto.id,
      fotografoId: regra.autorId,
      precoCentavos,
      descontoCentavos: 0,
      viaPacote: false,
      ...dividirItem(precoCentavos, regra),
    };
  });

  const subtotal = itens.reduce((soma, i) => soma + i.precoCentavos, 0);
  const desconto = itens.reduce((soma, i) => soma + i.descontoCentavos, 0);
  const pedido: PedidoInterno = {
    id: pedidoId,
    clienteId: null,
    emailComprador: comprador.email,
    nomeComprador: comprador.nome,
    whatsapp: comprador.aceitaWhatsapp ? comprador.whatsapp : null,
    aceitaWhatsapp: comprador.aceitaWhatsapp && comprador.whatsapp !== null,
    cupomId: null,
    subtotalCentavos: subtotal,
    descontoCentavos: desconto,
    totalCentavos: subtotal - desconto,
    metodo: comprador.metodo,
    status: "pendente",
    expiraEm: new Date(agora + VALIDADE_PEDIDO_MS).toISOString(),
    pagoEm: null,
    criadoEm: new Date(agora).toISOString(),
    tokenAcessoHash: hashToken(token),
    acessoExpiraEm: null,
    gatewayId: null,
    lembreteEnviadoEm: null,
  };

  await salvarPedido(pedido, itens);
  return { ok: true, pedidoId, token };
}

/**
 * Pedido acessado pelo link do convidado. Compara o hash do token em tempo constante e marca
 * como expirado o pendente que passou da validade.
 */
export async function buscarPedidoDoConvidado(pedidoId: string, token: string) {
  const encontrado = await buscarPedido(pedidoId);
  if (!encontrado || !tokenConfere(encontrado.pedido, token)) return null;

  const { pedido } = encontrado;
  if (pedido.status === "pendente" && new Date(pedido.expiraEm).getTime() < Date.now()) {
    // Antes de expirar, o job real confere no gateway se o pagamento não chegou (Fase 13).
    await mudarStatusPedido(pedido.id, "pendente", "expirado");
    return buscarPedido(pedidoId);
  }
  return encontrado;
}

/**
 * Confirma o pagamento. É o que o webhook do gateway vai chamar (Fase 13); hoje, a simulação.
 * Idempotente: só o primeiro aviso muda `pendente` para `pago` e cria os lançamentos; avisos
 * repetidos ou fora de ordem não fazem nada (docs/riscos.md, prioridade alta).
 */
export async function confirmarPagamento(pedidoId: string): Promise<boolean> {
  const agora = Date.now();
  const mudou = await mudarStatusPedido(pedidoId, "pendente", "pago", {
    pagoEm: new Date(agora).toISOString(),
  });
  if (!mudou) return false;

  const encontrado = await buscarPedido(pedidoId);
  if (!encontrado) return false;
  const disponivelEm = new Date(
    agora + PRAZO_DISPONIVEL_MS[encontrado.pedido.metodo],
  ).toISOString();
  const regras = await buscarRegrasDeDivisao(encontrado.itens.map((i) => i.fotoId));

  const novos: Lancamento[] = encontrado.itens.flatMap((item) => {
    const regra = regras.find((r) => r.fotoId === item.fotoId);
    const lancamentos: Lancamento[] = [
      {
        id: randomUUID(),
        fotografoId: item.fotografoId,
        itemPedidoId: item.id,
        valorCentavos: item.valorFotografoCentavos,
        disponivelEm,
        repasseId: null,
      },
    ];
    if (regra && item.valorDonoEventoCentavos > 0) {
      lancamentos.push({
        id: randomUUID(),
        fotografoId: regra.donoEventoId,
        itemPedidoId: item.id,
        valorCentavos: item.valorDonoEventoCentavos,
        disponivelEm,
        repasseId: null,
      });
    }
    return lancamentos;
  });
  await salvarLancamentos(novos);
  return true;
}
