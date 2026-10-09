import { z } from "zod";

import { reaisParaCentavos } from "@/lib/asaas";
import { somenteDigitos } from "@/lib/documentos";

// Regras da validação de saque do Asaas (./route.ts), separadas da rota para os testes:
//   - TRANSFER: aprova só se bater com um saque em `processando` (mesmo valor e mesma chave Pix)
//     ainda sem outra transferência. A ligação é gravada aqui, numa operação só, então uma
//     segunda transferência para o mesmo saque é recusada;
//   - PIX_REFUND: aprova (é o reembolso de uma venda, que volta para quem pagou);
//   - o resto (boleto, Pix por QR Code, recarga, split): recusa, a não ser que
//     ASAAS_APROVAR_OUTRAS_SAIDAS=1. Transferência manual feita pelo app do Asaas também cai
//     aqui e é recusada: para pagar alguém à mão, desligue a validação no painel do Asaas antes.

const transferencia = z.object({
  id: z.string().min(1).max(64),
  value: z.number().positive(),
  pixAddressKey: z.string().nullish(),
  bankAccount: z
    .object({ cpfCnpj: z.string().nullish(), pixAddressKey: z.string().nullish() })
    .nullish(),
});

const pedidoDeValidacao = z.object({
  type: z.string(),
  transfer: transferencia.optional(),
});

export type Decisao = { aprovado: true } | { aprovado: false; motivo: string };

export type Reivindicar = (dados: {
  transferenciaId: string;
  liquidoCentavos: number;
  chavesPix: string[];
}) => Promise<boolean>;

/** Chaves que o Asaas pode mandar para a transferência, só com dígitos (CPF/CNPJ). */
function chavesDaTransferencia(t: z.infer<typeof transferencia>) {
  const chaves = [t.pixAddressKey, t.bankAccount?.pixAddressKey, t.bankAccount?.cpfCnpj]
    .filter((c): c is string => Boolean(c))
    .map(somenteDigitos)
    .filter((c) => c.length === 11 || c.length === 14);
  return [...new Set(chaves)];
}

export async function decidirValidacao(
  corpo: unknown,
  reivindicar: Reivindicar,
  aprovarOutrasSaidas: boolean,
): Promise<Decisao> {
  const pedido = pedidoDeValidacao.safeParse(corpo);
  if (!pedido.success) return { aprovado: false, motivo: "Pedido de validação ilegível" };
  const { type, transfer } = pedido.data;

  if (type === "TRANSFER") {
    if (!transfer) return { aprovado: false, motivo: "Transferência sem dados" };
    const ligou = await reivindicar({
      transferenciaId: transfer.id,
      liquidoCentavos: reaisParaCentavos(transfer.value),
      chavesPix: chavesDaTransferencia(transfer),
    });
    return ligou
      ? { aprovado: true }
      : { aprovado: false, motivo: "Transferência sem saque correspondente no ClicouAí" };
  }
  if (type === "PIX_REFUND") return { aprovado: true };
  if (aprovarOutrasSaidas) return { aprovado: true };
  return { aprovado: false, motivo: `Saída do tipo ${type} não é feita pelo ClicouAí` };
}
