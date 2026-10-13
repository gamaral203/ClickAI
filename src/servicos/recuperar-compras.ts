import "server-only";

import { z } from "zod";

import { comprasPagasDoEmail, registrarMensagem } from "@/dados";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import { enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";

import { limiteAtingido, limiteDoIpAtingido } from "./limites";

// "Recuperar minhas compras": quem comprou sem conta e perdeu o link digita o e-mail da compra e
// recebe nele um link para a lista dos pedidos pagos daquele e-mail. A tela responde sempre igual
// (tendo compra ou não), para não revelar quem comprou no site. O link prova que a pessoa abriu o
// e-mail: é assinado pelo servidor, preso ao endereço, e vale 7 dias.

const PROPOSITO = "compras-do-email";
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

const email = z.email().max(254);

/** Link para a lista de compras do e-mail (só funciona aberto a partir do próprio e-mail). */
export function linkDasCompras(endereco: string) {
  const token = assinar(PROPOSITO, { e: endereco.trim().toLowerCase() }, VALIDADE_MS);
  return urlDoSite(`/recuperar-compras/lista?token=${token}`);
}

/** E-mail do link, ou `null` se o link foi alterado ou venceu. */
export function emailDoLinkDasCompras(token: string): string | null {
  const dados = conferirAssinatura(PROPOSITO, token) as { e?: unknown } | null;
  return typeof dados?.e === "string" ? dados.e : null;
}

export type ResultadoRecuperacao = { ok: true } | { ok: false; erro: string };

/**
 * Manda ao e-mail o link da lista de compras, se houver compra paga com ele. Limites por IP e por
 * e-mail seguram quem tenta usar a página para mandar e-mails a terceiros.
 */
export async function enviarLinkDasCompras(entrada: unknown): Promise<ResultadoRecuperacao> {
  const valido = email.safeParse(typeof entrada === "string" ? entrada.trim() : entrada);
  if (!valido.success) return { ok: false, erro: "Digite um e-mail válido." };
  const endereco = valido.data.toLowerCase();
  if (
    (await limiteDoIpAtingido("recuperar_compras_ip")) ||
    (await limiteAtingido("recuperar_compras_email", endereco))
  ) {
    return { ok: false, erro: "Muitos pedidos seguidos. Espere alguns minutos e tente de novo." };
  }
  const compras = await comprasPagasDoEmail(endereco);
  if (compras.length === 0) return { ok: true };

  const assunto = "Suas compras no ClicouAí";
  const quantas = compras.length === 1 ? "1 compra paga" : `${compras.length} compras pagas`;
  const paragrafos = [
    "Olá! Recebemos o pedido para recuperar as suas fotos.",
    `Encontramos ${quantas} com este e-mail. Abra a lista para baixar as fotos de cada uma. O link vale 7 dias; depois, é só pedir outro.`,
    "Se não foi você que pediu, pode ignorar este e-mail.",
  ];
  const botao = { texto: "Ver minhas compras", url: linkDasCompras(endereco) };
  await registrarMensagem({
    pedidoId: compras[0].pedidoId,
    canal: "email",
    tipo: "entrega",
    para: endereco,
    assunto,
    texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
  });
  await enviarEmail({ para: endereco, assunto, paragrafos, botao });
  return { ok: true };
}
