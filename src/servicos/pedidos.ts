import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { connection } from "next/server";

import {
  buscarPedido,
  buscarRegrasDeDivisao,
  buscarUsuario,
  marcarPedidoPago,
  mudarStatusPedido,
  salvarLancamentos,
  salvarPedido,
  type ItemPedido,
  type Lancamento,
  type MetodoPagamento,
  type PedidoInterno,
  type RegraDeDivisao,
} from "@/dados";

import { provedorDePagamento } from "@/lib/gateway";
import { podeComprar } from "@/lib/navegacao";

import { calcularCompra, mensagemCupom, type OpcoesCompra } from "./carrinho";
import { avisarVenda, enviarEntrega, linkDoPedidoConfere } from "./mensagens";

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
  /** CPF/CNPJ só com dígitos; o checkout pede quando o pagamento é pelo Asaas. */
  cpf?: string | null;
};

/**
 * Divide o valor pago por um item (preço menos desconto) entre o autor e, se o autor é um
 * colaborador, o dono do evento: o desconto pesa para os dois na mesma proporção. A comissão
 * da plataforma não sai aqui: cada um paga a sua no saque (src/servicos/saques.ts). Os
 * centavos de arredondamento ficam com o autor, e a soma sempre fecha com o valor
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
  | {
      ok: false;
      motivo: "carrinho_vazio" | "itens_indisponiveis" | "pacote_recusado" | "conta_sem_compra";
    }
  | { ok: false; motivo: "cupom_recusado"; mensagem: string };

/**
 * Cria o pedido como `pendente` a partir dos ids do carrinho, com preço, descontos e divisão
 * calculados aqui (o mesmo cálculo do carrinho). Devolve o token de acesso do convidado uma
 * única vez; o pedido guarda só o hash.
 *
 * Conta de fotógrafo ou de gestor não compra (docs/arquitetura.md, "Login e papéis"): o papel é
 * lido do banco pelo `clienteId`, que o checkout tira da sessão, nunca do navegador.
 */
export async function criarPedido(
  ids: string[],
  comprador: DadosComprador,
  opcoes: OpcoesCompra = {},
): Promise<ResultadoCriarPedido> {
  if (comprador.clienteId) {
    const cliente = await buscarUsuario(comprador.clienteId);
    if (cliente && !podeComprar(cliente)) return { ok: false, motivo: "conta_sem_compra" };
  }
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return { ok: false, motivo: "carrinho_vazio" };

  const { itens: itensVenda, descontos } = await calcularCompra(unicos, opcoes);
  // Se algo mudou entre o carrinho e o checkout (item saiu de venda, pacote venceu, cupom
  // deixou de valer), a pessoa revisa antes de pagar: o total nunca muda em silêncio.
  if (itensVenda.length !== unicos.length) return { ok: false, motivo: "itens_indisponiveis" };
  if (descontos.pacotesRecusados.length > 0) return { ok: false, motivo: "pacote_recusado" };
  if (descontos.cupom.situacao === "recusado") {
    return { ok: false, motivo: "cupom_recusado", mensagem: mensagemCupom(descontos.cupom) ?? "" };
  }
  const calculados = new Map(descontos.itens.map((i) => [i.fotoId, i]));

  const regras = await buscarRegrasDeDivisao(unicos);
  const agora = Date.now();
  const pedidoId = randomUUID();
  const token = randomBytes(32).toString("base64url");

  const itens: ItemPedido[] = itensVenda.map(({ foto, precoCentavos }) => {
    const regra = regras.find((r) => r.fotoId === foto.id);
    const calculado = calculados.get(foto.id);
    if (!regra || !calculado) throw new Error(`Sem regra de divisão ou cálculo para ${foto.id}`);
    return {
      id: randomUUID(),
      pedidoId,
      fotoId: foto.id,
      fotografoId: regra.autorId,
      precoCentavos,
      descontoCentavos: calculado.descontoCentavos,
      viaPacote: calculado.viaPacote,
      ...dividirItem(precoCentavos - calculado.descontoCentavos, regra),
    };
  });

  const subtotal = itens.reduce((soma, i) => soma + i.precoCentavos, 0);
  const desconto = itens.reduce((soma, i) => soma + i.descontoCentavos, 0);
  const pedido: PedidoInterno = {
    id: pedidoId,
    clienteId: comprador.clienteId,
    emailComprador: comprador.email,
    nomeComprador: comprador.nome,
    cpfComprador: comprador.cpf ?? null,
    whatsapp: comprador.aceitaWhatsapp ? comprador.whatsapp : null,
    aceitaWhatsapp: comprador.aceitaWhatsapp && comprador.whatsapp !== null,
    cupomId: descontos.cupom.situacao === "aplicado" ? descontos.cupom.cupomId : null,
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

/**
 * O pedido pode ser visto por esta credencial? Token do link do checkout, link assinado das
 * mensagens (e-mail e WhatsApp) ou dono logado.
 */
export function podeAcessar(
  pedido: Pick<PedidoInterno, "id" | "tokenAcessoHash" | "clienteId">,
  { token, clienteId }: Credencial,
) {
  if (token && (tokenConfere(pedido, token) || linkDoPedidoConfere(pedido.id, token))) return true;
  return Boolean(clienteId && pedido.clienteId === clienteId);
}

/**
 * Pedido acessado pelo link do convidado ou pelo cliente logado dono dele. Marca como
 * expirado o pendente que passou da validade.
 */
export async function buscarPedidoComAcesso(pedidoId: string, credencial: Credencial) {
  // Com Cache Components, o relógio só pode ser lido depois de esperar a requisição; a
  // conferência do link assinado e a validade do pedido leem o relógio.
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
  // `pago` e uso do cupom numa transação só (marcarPedidoPago): repetir o aviso não soma o uso
  // de novo. Se outro pedido esgotou o cupom nesse meio-tempo, o pagamento já foi feito com o
  // desconto e vale; o caso fica registrado como alerta, sem estorno automático.
  const pago = await marcarPedidoPago(pedidoId, new Date(agora).toISOString());
  if (!pago.mudou) return false;

  const encontrado = await buscarPedido(pedidoId);
  if (!encontrado) return false;
  if (pago.cupomEsgotado) {
    console.error("ALERTA cupom usado além do limite: pedido pago mantido, sem estorno", {
      pedido: pedidoId,
      cupom: encontrado.pedido.cupomId,
    });
  }
  await salvarLancamentos(
    await lancamentosDaVenda(encontrado.itens, agora, encontrado.pedido.metodo),
  );
  // A entrega por mensagem não pode desfazer o pagamento: se falhar, só fica registrado. O
  // comprador continua com o link da página do pedido e com Minhas compras.
  await enviarEntrega(encontrado.pedido).catch((erro) =>
    console.error(`Falha ao enviar a entrega do pedido ${pedidoId}`, erro),
  );
  await avisarVenda(pedidoId).catch((erro) =>
    console.error(`Falha ao avisar a venda do pedido ${pedidoId}`, erro),
  );
  return true;
}

/**
 * Lançamentos de uma venda confirmada em `agora`: a parte do autor de cada item e, se o autor é
 * colaborador, a do dono do evento. No Asaas, o dinheiro do cartão só fica disponível perto de
 * 30 dias depois: a venda no cartão não entra no saque antecipado, só no normal.
 */
export async function lancamentosDaVenda(
  itens: ItemPedido[],
  agora: number,
  metodo?: MetodoPagamento,
): Promise<Lancamento[]> {
  const disponivelEm = new Date(agora + PRAZO_SAQUE_MS).toISOString();
  const cartaoNoAsaas = metodo === "cartao" && provedorDePagamento() === "asaas";
  const antecipavelEm = cartaoNoAsaas
    ? disponivelEm
    : new Date(agora + PRAZO_ANTECIPACAO_MS).toISOString();
  const regras = await buscarRegrasDeDivisao(itens.map((i) => i.fotoId));
  return itens.flatMap((item) => {
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
}
