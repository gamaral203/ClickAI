import "server-only";

import { registrarMensagem, vendasDoPedidoPorFotografo, type PedidoInterno } from "@/dados";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import { enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";
import { formatarPreco } from "@/lib/formatar";

// Mensagens ao comprador (docs/arquitetura.md, "Compra e pagamento" e "Carrinho abandonado").
// O e-mail é sempre o canal principal; o WhatsApp só vai com o consentimento dado no checkout
// (docs/riscos.md: número bloqueado). Na Parte A o envio é simulado: a mensagem fica na caixa
// de saída que a equipe vê em /admin/mensagens; com o Resend configurado, o e-mail também sai de
// verdade (src/lib/email.ts). O WhatsApp real entra depois.

/** O link da mensagem vale por 1 ano (a decisão do prazo de acesso está em aberto). */
const VALIDADE_LINK_PEDIDO_MS = 365 * 24 * 60 * 60 * 1000;
const VALIDADE_LINK_RECUPERAR_MS = 30 * 24 * 60 * 60 * 1000;
const PROPOSITO_PEDIDO = "acesso-pedido";
const PROPOSITO_RECUPERAR = "recuperar-carrinho";

/**
 * Link para a página do pedido, assinado pelo servidor. O pedido guarda só o hash do token
 * original, então a mensagem leva um link próprio, que a página aceita no lugar do token.
 */
export function linkDoPedido(pedidoId: string) {
  const token = assinar(PROPOSITO_PEDIDO, { p: pedidoId }, VALIDADE_LINK_PEDIDO_MS);
  return urlDoSite(`/pedidos/${pedidoId}?token=${token}`);
}

/** O token é um link de mensagem válido para este pedido? */
export function linkDoPedidoConfere(pedidoId: string, token: string) {
  const dados = conferirAssinatura(PROPOSITO_PEDIDO, token) as { p?: unknown } | null;
  return dados?.p === pedidoId;
}

/** Link que remonta o carrinho de um pedido que expirou sem pagamento. */
export function linkParaRecuperar(pedidoId: string) {
  const token = assinar(PROPOSITO_RECUPERAR, { p: pedidoId }, VALIDADE_LINK_RECUPERAR_MS);
  return urlDoSite(`/carrinho/recuperar?token=${token}`);
}

/** Pedido do link de recuperação, ou `null` se o link foi alterado ou venceu. */
export function pedidoDoLinkParaRecuperar(token: string): string | null {
  const dados = conferirAssinatura(PROPOSITO_RECUPERAR, token) as { p?: unknown } | null;
  return typeof dados?.p === "string" ? dados.p : null;
}

/**
 * Registra a mensagem na caixa de saída (/admin/mensagens) e, com o Resend configurado, envia o
 * e-mail de verdade. O WhatsApp só vai com o consentimento dado no checkout (e, até a API real,
 * fica só registrado).
 */
async function enviar(
  pedido: PedidoInterno,
  tipo: "entrega" | "lembrete" | "lembrete_pix",
  assunto: string,
  paragrafos: string[],
  botao: { texto: string; url: string },
) {
  const texto = [...paragrafos, `${botao.texto}: ${botao.url}`].join(" ");
  await registrarMensagem({
    pedidoId: pedido.id,
    canal: "email",
    tipo,
    para: pedido.emailComprador,
    assunto,
    texto,
  });
  await enviarEmail({ para: pedido.emailComprador, assunto, paragrafos, botao });
  if (pedido.aceitaWhatsapp && pedido.whatsapp) {
    await registrarMensagem({
      pedidoId: pedido.id,
      canal: "whatsapp",
      tipo,
      para: pedido.whatsapp,
      assunto,
      texto,
    });
  }
}

/** Depois do pagamento: o link para baixar os originais. */
export async function enviarEntrega(pedido: PedidoInterno) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  await enviar(
    pedido,
    "entrega",
    "Suas fotos estão prontas para baixar",
    [
      `Olá, ${primeiroNome}! Recebemos o pagamento de ${formatarPreco(pedido.totalCentavos)}.`,
      "Suas fotos já estão liberadas em alta resolução, sem marca d'água. Guarde este e-mail: o link é o seu acesso às fotos compradas.",
    ],
    { texto: "Baixar minhas fotos", url: linkDoPedido(pedido.id) },
  );
}

/** Pedido que expirou sem pagamento: convida a refazer a compra. */
export async function enviarLembrete(pedido: PedidoInterno) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  await enviar(
    pedido,
    "lembrete",
    "Suas fotos ainda estão esperando por você",
    [
      `Olá, ${primeiroNome}! O pagamento do seu pedido não chegou e ele expirou.`,
      "As fotos continuam disponíveis: é só refazer a compra.",
    ],
    { texto: "Refazer a compra", url: linkParaRecuperar(pedido.id) },
  );
}

/** Pix gerado e ainda não pago: avisa quanto tempo falta antes de o código vencer. */
export async function enviarLembretePix(pedido: PedidoInterno, agora = Date.now()) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  const minutos = Math.max(1, Math.round((new Date(pedido.expiraEm).getTime() - agora) / 60_000));
  await enviar(
    pedido,
    "lembrete_pix",
    `Seu Pix vence em ${minutos} minutos`,
    [
      `Olá, ${primeiroNome}! Suas fotos estão reservadas, mas o Pix de ${formatarPreco(pedido.totalCentavos)} ainda não foi pago.`,
      `O código vence em ${minutos} minutos. Depois disso, é preciso refazer o pedido.`,
    ],
    { texto: "Pagar com Pix agora", url: linkDoPedido(pedido.id) },
  );
}

/**
 * Avisa cada fotógrafo que teve parte num pedido pago: quanto vendeu e em qual evento. O valor é
 * bruto: a taxa da plataforma sai no saque.
 */
export async function avisarVenda(pedidoId: string) {
  for (const venda of await vendasDoPedidoPorFotografo(pedidoId)) {
    const assunto = `Você vendeu ${formatarPreco(venda.valorCentavos)} no ClicouAí`;
    const paragrafos = [
      `Boa, ${venda.nome}! Uma venda acabou de ser paga: ${venda.itens} ${venda.itens === 1 ? "item" : "itens"} em ${venda.eventos.join(", ")}.`,
      `A sua parte é de ${formatarPreco(venda.valorCentavos)} (valor bruto; a taxa da plataforma sai no saque).`,
    ];
    const botao = { texto: "Ver no painel", url: urlDoSite("/painel/vendas") };
    await registrarMensagem({
      pedidoId,
      canal: "email",
      tipo: "venda",
      para: venda.email,
      assunto,
      texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
    });
    await enviarEmail({ para: venda.email, assunto, paragrafos, botao });
  }
}

/**
 * Link de confirmação do cadastro. Não vai para a caixa de saída: o link dá acesso à conta.
 * Devolve se o e-mail saiu (sem Resend, a tela mostra o link, como no ambiente de exemplo).
 */
export async function enviarConfirmacaoDeEmail(para: string, nome: string, token: string) {
  return enviarEmail({
    para,
    assunto: "Confirme seu e-mail no ClicouAí",
    paragrafos: [
      `Olá, ${nome.split(" ")[0]}! Confirme seu e-mail para ligar à sua conta as compras feitas com ele.`,
      "O link vale por 24 horas. Se você não criou uma conta no ClicouAí, ignore este e-mail.",
    ],
    botao: {
      texto: "Confirmar e-mail",
      url: urlDoSite(`/conta/confirmar?token=${encodeURIComponent(token)}`),
    },
  });
}
