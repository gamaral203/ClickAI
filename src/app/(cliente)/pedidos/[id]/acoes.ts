"use server";

import { z } from "zod";

import { emProducao } from "@/db/conexao";
import { gatewayConfigurado, provedorDePagamento } from "@/lib/gateway";
import { limiteDoIpAtingido } from "@/servicos/limites";
import { iniciarCobrancaPix, pagarComCartao, type ResultadoCartao } from "@/servicos/pagamentos";
import { buscarPedidoComAcesso, confirmarPagamento } from "@/servicos/pedidos";
import { usuarioAtual } from "@/servicos/sessao";

const acesso = z.object({ pedidoId: z.uuid(), token: z.string().min(20).max(400).nullable() });

async function credencial(token: string | null) {
  const usuario = await usuarioAtual();
  return { token, clienteId: usuario?.id };
}

/**
 * Pagamento simulado (Parte A), só quando não há credenciais do Mercado Pago. Chama a mesma
 * confirmação que o webhook usa.
 */
export async function simularPagamento(pedidoId: string, token: string | null): Promise<boolean> {
  // Na produção, nunca: sem MP_ACCESS_TOKEN, qualquer comprador marcaria o próprio pedido como
  // pago e baixaria os originais sem pagar.
  if (emProducao() || gatewayConfigurado()) return false;
  const dados = acesso.safeParse({ pedidoId, token });
  if (!dados.success) return false;
  const encontrado = await buscarPedidoComAcesso(
    dados.data.pedidoId,
    await credencial(dados.data.token),
  );
  if (!encontrado || encontrado.pedido.status !== "pendente") return false;
  return confirmarPagamento(encontrado.pedido.id);
}

/** Gera de novo o QR Code Pix quando a primeira tentativa, no checkout, falhou. */
export async function gerarPix(pedidoId: string, token: string | null): Promise<boolean> {
  const dados = acesso.safeParse({ pedidoId, token });
  if (!dados.success || !gatewayConfigurado()) return false;
  if (await limiteDoIpAtingido("pix_ip")) return false;
  const encontrado = await buscarPedidoComAcesso(
    dados.data.pedidoId,
    await credencial(dados.data.token),
  );
  if (!encontrado) return false;
  try {
    return await iniciarCobrancaPix(encontrado.pedido.id);
  } catch (erro) {
    console.error("Falha ao gerar o Pix", erro);
    return false;
  }
}

// O que o Card Payment Brick entrega no onSubmit. O valor não vem daqui: o servidor usa o
// total do pedido.
const cartao = z.object({
  token: z.string().min(10).max(200),
  payment_method_id: z.string().regex(/^[a-z_]{2,30}$/),
  payment_type_id: z.enum(["credit_card", "debit_card"]).default("credit_card"),
  payer: z
    .object({
      identification: z
        .object({
          type: z.string().regex(/^[A-Z]{2,5}$/),
          number: z.string().regex(/^\d{11,14}$/),
        })
        .optional(),
    })
    .optional(),
});

export async function pagarComCartaoAcao(
  pedidoId: string,
  token: string | null,
  dadosCartao: unknown,
): Promise<ResultadoCartao> {
  const dados = acesso.safeParse({ pedidoId, token });
  const formulario = cartao.safeParse(dadosCartao);
  if (!dados.success || !formulario.success || provedorDePagamento() !== "mercadopago") {
    return { ok: false, motivo: "indisponivel" };
  }
  if (await limiteDoIpAtingido("cartao_ip")) return { ok: false, motivo: "limite" };
  const documento = formulario.data.payer?.identification;
  try {
    return await pagarComCartao(dados.data.pedidoId, await credencial(dados.data.token), {
      token: formulario.data.token,
      bandeira: formulario.data.payment_method_id,
      tipo: formulario.data.payment_type_id,
      documento: documento ? { tipo: documento.type, numero: documento.number } : null,
    });
  } catch (erro) {
    console.error("Falha ao cobrar o cartão", erro);
    return { ok: false, motivo: "recusado" };
  }
}
