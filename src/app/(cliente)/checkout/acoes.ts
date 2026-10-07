"use server";

import { z } from "zod";

import { opcoesCompra } from "@/app/(cliente)/carrinho/validacao";
import { mercadoPagoConfigurado } from "@/lib/mercadopago";
import { iniciarCobrancaPix } from "@/servicos/pagamentos";
import { criarPedido } from "@/servicos/pedidos";
import { usuarioAtual } from "@/servicos/sessao";

const entrada = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  nome: z.string().trim().min(2, "Informe seu nome.").max(100, "Nome muito longo."),
  email: z.email("Informe um e-mail válido.").max(254),
  // Só dígitos; aceita com ou sem o 55 do Brasil.
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Informe o WhatsApp com DDD.")
    .transform((v) => (v === "" ? null : v)),
  aceitaWhatsapp: z.boolean(),
  metodo: z.enum(["pix", "cartao"], "Escolha a forma de pagamento."),
  opcoes: opcoesCompra,
});

export type CampoCheckout = "nome" | "email" | "whatsapp" | "aceitaWhatsapp" | "metodo" | "cupom";

export type ResultadoCheckout =
  | { ok: true; url: string }
  | { ok: false; erros: Partial<Record<CampoCheckout, string>>; mensagem?: string };

export async function finalizarCompra(dados: unknown): Promise<ResultadoCheckout> {
  const validacao = entrada.safeParse(dados);
  if (!validacao.success) {
    const erros: Partial<Record<CampoCheckout, string>> = {};
    for (const problema of validacao.error.issues) {
      const campo = problema.path[0];
      if (typeof campo === "string" && campo !== "ids" && campo !== "opcoes" && !(campo in erros)) {
        erros[campo as CampoCheckout] = problema.message;
      }
    }
    const semCampo = Object.keys(erros).length === 0;
    return {
      ok: false,
      erros,
      mensagem: semCampo ? "Seu carrinho mudou. Volte ao carrinho e confira os itens." : undefined,
    };
  }

  const { ids, aceitaWhatsapp, whatsapp, opcoes, ...comprador } = validacao.data;
  if (aceitaWhatsapp && !whatsapp) {
    return { ok: false, erros: { whatsapp: "Informe o WhatsApp ou desmarque a opção." } };
  }

  // Cliente logado: o pedido fica na conta dele (Minhas compras), além do link com token.
  const usuario = await usuarioAtual();
  const resultado = await criarPedido(
    ids,
    { ...comprador, clienteId: usuario?.id ?? null, whatsapp, aceitaWhatsapp },
    opcoes,
  );
  if (!resultado.ok) {
    if (resultado.motivo === "cupom_recusado") {
      return { ok: false, erros: { cupom: resultado.mensagem } };
    }
    const mensagens = {
      carrinho_vazio: "Seu carrinho está vazio.",
      itens_indisponiveis:
        "Algum item do carrinho não está mais à venda. Volte ao carrinho e confira.",
      pacote_recusado: "Um pacote do carrinho não vale mais. Volte ao carrinho e confira o total.",
    } as const;
    return { ok: false, erros: {}, mensagem: mensagens[resultado.motivo] };
  }
  // Pix: o QR Code já é gerado aqui. Se o Mercado Pago falhar, o pedido existe do mesmo jeito
  // e a página dele oferece gerar de novo.
  if (comprador.metodo === "pix" && mercadoPagoConfigurado()) {
    await iniciarCobrancaPix(resultado.pedidoId).catch((erro) =>
      console.error("Falha ao gerar o Pix no checkout", erro),
    );
  }
  // O token vai só no link; quem tem o link acessa o pedido (como o link do e-mail).
  return { ok: true, url: `/pedidos/${resultado.pedidoId}?token=${resultado.token}` };
}
