import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { connection } from "next/server";

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
const DIA_MS = 24 * 60 * 60 * 1000;
/** Prazo para a venda entrar no saque normal (com 10%), seja Pix ou cartão. */
export const PRAZO_SAQUE_MS = 30 * DIA_MS;
/** Prazo para a venda entrar no saque antecipado (com 10% + 1%). */
export const PRAZO_ANTECIPACAO_MS = DIA_MS;

export type DadosComprador = {
  /** Cliente logado que faz a compra; `null` para convidado. */
  clienteId: string | null;
  nome: string;
  email: string;
  whatsapp: string | null;
  aceitaWhatsapp: boolean;
  metodo: MetodoPagamento;
};

/**
 * Divide o preço de um item entre o autor e, se o autor é um colaborador, o dono do evento.
 * A comissão da plataforma não sai aqui: cada um paga a sua no saque (src/servicos/saques.ts).
 * Os centavos de arredondamento ficam com o autor, e a soma sempre fecha com o preço
 * (docs/riscos.md, divisão perde centavos).
 */
export function dividirItem(precoCentavos: number, regra: RegraDeDivisao) {
  const dono =
    regra.autorId === regra.donoEventoId
      ? 0
      : Math.floor((precoCentavos * regra.comissaoDonoPct) / 100);
  return { valorDonoEventoCentavos: dono, valorFotografoCentavos: precoCentavos - dono };
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
    clienteId: comprador.clienteId,
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
    pix: null,
    lembreteEnviadoEm: null,
  };

  await salvarPedido(pedido, itens);
  return { ok: true, pedidoId, token };
}

/** Quem está pedindo acesso a um pedido: o token do link e/ou o cliente logado. */
export type Credencial = { token?: string | null; clienteId?: string | null };

/** O pedido pode ser visto por esta credencial? Token do link ou dono logado. */
export function podeAcessar(
  pedido: Pick<PedidoInterno, "tokenAcessoHash" | "clienteId">,
  { token, clienteId }: Credencial,
) {
  if (token && tokenConfere(pedido, token)) return true;
  return Boolean(clienteId && pedido.clienteId === clienteId);
}

/**
 * Pedido acessado pelo link do convidado ou pelo cliente logado dono dele. Marca como
 * expirado o pendente que passou da validade.
 */
export async function buscarPedidoComAcesso(pedidoId: string, credencial: Credencial) {
  // Com Cache Components, o relógio só pode ser lido depois de esperar a requisição.
  await connection();
  const encontrado = await buscarPedido(pedidoId);
  if (!encontrado || !podeAcessar(encontrado.pedido, credencial)) return null;

  const { pedido } = encontrado;
  // Pedido com cobrança no gateway só expira depois de conferir lá se o pagamento não chegou
  // (src/servicos/pagamentos.ts); o sem cobrança expira direto.
  if (
    pedido.status === "pendente" &&
    pedido.gatewayId === null &&
    new Date(pedido.expiraEm).getTime() < Date.now()
  ) {
    await mudarStatusPedido(pedido.id, "pendente", "expirado");
    return buscarPedido(pedidoId);
  }
  return encontrado;
}

/**
 * Confirma o pagamento. Quem chama: o webhook do Mercado Pago e a conferência do servidor na
 * API dele (src/servicos/pagamentos.ts), ou a simulação quando não há credenciais.
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
  const disponivelEm = new Date(agora + PRAZO_SAQUE_MS).toISOString();
  const antecipavelEm = new Date(agora + PRAZO_ANTECIPACAO_MS).toISOString();
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
        antecipavelEm,
        saqueId: null,
      },
    ];
    if (regra && item.valorDonoEventoCentavos > 0) {
      lancamentos.push({
        id: randomUUID(),
        fotografoId: regra.donoEventoId,
        itemPedidoId: item.id,
        valorCentavos: item.valorDonoEventoCentavos,
        disponivelEm,
        antecipavelEm,
        saqueId: null,
      });
    }
    return lancamentos;
  });
  await salvarLancamentos(novos);
  return true;
}
