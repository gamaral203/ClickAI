import { after } from "next/server";
import { z } from "zod";

import { confirmarEnvio } from "@/servicos/envios";

import { comChave, corpoJson, resposta } from "../../comum";

// Plugin do Lightroom, passo 2 do envio: depois do PUT ao R2, confere e processa a foto (a mesma
// confirmação do painel, src/servicos/envios.ts, confirmarEnvio): prévia e miniatura com marca
// d'água, original guardado e rostos cadastrados depois da resposta. Idempotente: chamar de novo
// com a foto já pronta responde `pronta`.

/** Mesmo teto da rota de processamento do painel (uma foto leva segundos). */
export const maxDuration = 300;

const pedido = z.object({ fotoId: z.uuid() }).strict();

export async function POST(request: Request) {
  return comChave(request, async (dono) => {
    const dados = pedido.safeParse(await corpoJson(request, 1024));
    if (!dados.success) return resposta({ erro: "Pedido inválido." }, 400);
    const r = await confirmarEnvio(dono.fotografoId, dados.data.fotoId, { depois: after });
    if ("erro" in r) return resposta({ erro: r.erro }, 422);
    // `emAndamento`: outra chamada está processando, ou a foto já ficou pronta antes.
    return resposta({ ok: true, emAndamento: "emAndamento" in r });
  });
}
