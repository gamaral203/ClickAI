// Preenche a taxa do Mercado Pago dos pedidos pagos ANTES da migração 0048 (taxa_gateway_*
// nulos), lendo cada pagamento na API: GET /v1/orders/{id} e GET /v1/payments/{id}, só leitura
// (nenhuma cobrança, estorno ou payout). Só grava as três colunas novas e só onde ainda estão
// nulas; nenhum valor, status, lançamento ou saque é tocado. Sem a taxa real, não grava nada (a
// tela já estima na leitura).
//
// Uso (opcional, conferir antes de rodar; NUNCA rodado pelo agente):
//   DATABASE_URL=... MP_ACCESS_TOKEN=... npx tsx --conditions=react-server scripts/backfill-taxas-mp.ts
//     → simulação: lista o que gravaria;
//   ... scripts/backfill-taxas-mp.ts --aplicar
//     → grava. Recusa rodar com VERCEL_ENV=production (rode da sua máquina, apontando o banco).

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { criarCliente, urlDoBanco } from "../src/db/conexao";
import * as schema from "../src/db/schema";
import { buscarOrder, buscarTaxaDaOrder } from "../src/lib/mercadopago";

const t = schema;

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  if (process.env.VERCEL_ENV === "production") {
    console.error("Recusado: não rode o backfill dentro da produção da Vercel.");
    process.exitCode = 1;
    return;
  }
  const url = urlDoBanco();
  if (!url || !process.env.MP_ACCESS_TOKEN) {
    console.error("Defina DATABASE_URL e MP_ACCESS_TOKEN.");
    process.exitCode = 1;
    return;
  }
  const cliente = criarCliente(url, { maximo: 1 });
  try {
    const banco = drizzle({ client: cliente, schema, casing: "snake_case" });
    const pedidos = await banco
      .select({ id: t.pedidos.id, gatewayId: t.pedidos.gatewayId, total: t.pedidos.totalCentavos })
      .from(t.pedidos)
      .where(
        and(
          eq(t.pedidos.status, "pago"),
          isNull(t.pedidos.taxaGatewayOrigem),
          isNotNull(t.pedidos.gatewayId),
        ),
      );
    console.log(
      `${pedidos.length} pedido(s) pago(s) sem taxa gravada. ${aplicar ? "Gravando." : "Simulação."}`,
    );
    let gravados = 0;
    for (const p of pedidos) {
      try {
        const order = await buscarOrder(p.gatewayId!);
        if (order.totalCentavos !== p.total || order.referencia !== p.id) {
          console.warn(`${p.id}: a order não confere com o pedido; pulado.`);
          continue;
        }
        const taxa = await buscarTaxaDaOrder(order.pagamentoIds ?? [], p.total);
        if (!taxa) {
          console.log(`${p.id}: o Mercado Pago não informou a taxa; fica a estimativa da tela.`);
          continue;
        }
        console.log(
          `${p.id}: taxa ${taxa.taxaCentavos} centavos, líquido ${taxa.liquidoCentavos}.`,
        );
        if (!aplicar) continue;
        const r = await banco
          .update(t.pedidos)
          .set({
            taxaGatewayCentavos: taxa.taxaCentavos,
            liquidoRecebidoCentavos: taxa.liquidoCentavos,
            taxaGatewayOrigem: "mp",
          })
          .where(and(eq(t.pedidos.id, p.id), isNull(t.pedidos.taxaGatewayOrigem)))
          .returning({ id: t.pedidos.id });
        gravados += r.length;
      } catch (erro) {
        console.warn(`${p.id}: falhou (${erro instanceof Error ? erro.message : "erro"}).`);
      }
    }
    console.log(aplicar ? `${gravados} pedido(s) atualizado(s).` : "Nada gravado (simulação).");
  } finally {
    await cliente.end().catch(() => {});
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
