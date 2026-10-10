import "server-only";

import { gestoresParaAviso, usuarioDoFotografo, type FotografoConta, type Saque } from "@/dados";
import { enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { enviarPush } from "@/lib/push";

// Avisos do saque manual (src/servicos/saques.ts): a gestão fica sabendo do pedido e paga em até
// 1 dia; o fotógrafo fica sabendo quando a gestão dá baixa. E-mail e notificação do navegador; uma
// falha aqui nunca desfaz o saque.

/** Prazo que a gestão tem para fazer o Pix depois do pedido. */
export const PRAZO_PAGAMENTO_SAQUE_MS = 24 * 60 * 60 * 1000;

export function pagarAte(saque: Pick<Saque, "criadoEm">) {
  return new Date(new Date(saque.criadoEm).getTime() + PRAZO_PAGAMENTO_SAQUE_MS).toISOString();
}

/** Passou do prazo de 1 dia para a gestão pagar? */
export function saqueAtrasado(saque: Pick<Saque, "criadoEm">, agora = Date.now()) {
  return new Date(pagarAte(saque)).getTime() < agora;
}

/** Mostra só o começo e o fim do CPF/CNPJ (para e-mail e notificação). */
function chaveCurta(chave: string) {
  return chave.length > 5 ? `${chave.slice(0, 3)}…${chave.slice(-2)}` : chave;
}

export async function avisarSaqueSolicitado(saque: Saque, conta: FotografoConta) {
  try {
    const gestores = await gestoresParaAviso();
    const valor = formatarPreco(saque.liquidoCentavos);
    const prazo = formatarDataEHora(pagarAte(saque));
    await enviarPush(
      gestores.map((g) => g.id),
      {
        titulo: "Novo pedido de saque",
        corpo: `${conta.nomePublico} pediu ${valor}${saque.antecipado ? " (antecipado)" : ""}. Pagar até ${prazo}.`,
        url: "/admin/saques",
      },
    );
    for (const gestor of gestores) {
      await enviarEmail({
        para: gestor.email,
        assunto: `Saque pedido: ${conta.nomePublico}, ${valor}`,
        paragrafos: [
          `${conta.nomePublico} pediu um saque${saque.antecipado ? " antecipado" : ""} de ${valor}, para a chave Pix ${chaveCurta(saque.chavePix)} (o CPF/CNPJ dele).`,
          `Faça o Pix pelo app do banco até ${prazo} e dê baixa como pago na página de saques da gestão.`,
        ],
        botao: { texto: "Abrir os saques", url: urlDoSite("/admin/saques") },
      });
    }
  } catch (erro) {
    console.error("Falha ao avisar a gestão do pedido de saque", { saque: saque.id, erro });
  }
}

export async function avisarSaquePago(saque: Saque) {
  try {
    const usuario = await usuarioDoFotografo(saque.fotografoId);
    if (!usuario) return;
    const valor = formatarPreco(saque.liquidoCentavos);
    await enviarPush([usuario.id], {
      titulo: "Seu saque foi pago 💸",
      corpo: `${valor} enviados por Pix para o seu CPF/CNPJ.`,
      url: "/painel/vendas",
    });
    await enviarEmail({
      para: usuario.email,
      assunto: `Seu saque de ${valor} foi pago`,
      paragrafos: [
        `Oi, ${usuario.nome}! O seu saque de ${valor} foi enviado por Pix para o seu CPF/CNPJ.`,
        "Confira no app do seu banco. Qualquer dúvida, fale com a gente.",
      ],
      botao: { texto: "Ver no painel", url: urlDoSite("/painel/vendas") },
    });
  } catch (erro) {
    console.error("Falha ao avisar o fotógrafo do saque pago", { saque: saque.id, erro });
  }
}
