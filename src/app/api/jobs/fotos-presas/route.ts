import type { NextRequest } from "next/server";

import { haFotoParada } from "@/dados/processamento";
import { chamadaDeJobAutorizada } from "@/lib/cron";
import { ESPERA_FOTO_PRESA_MS } from "@/lib/limites-envio";

// Fila das fotos presas em `processando` (docs/arquitetura.md, "Upload"): o cron da Vercel chama
// a cada minuto (vercel.json), com Authorization: Bearer CRON_SECRET. Só cuida de fotos: não toca
// em saques, pedidos nem transferências, que continuam em /api/jobs/revisao e /api/jobs/pedidos.

/**
 * O trabalho novo para em PRAZO_DA_FILA_MS (45 s), dentro do minuto. O teto folgado é só para a
 * última foto (ou vídeo) terminar: cortar uma foto grande gastaria uma tentativa dela à toa.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!chamadaDeJobAutorizada(request)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  // Sem trabalho, a chamada mais comum, responde com uma consulta só, sem carregar Sharp e AWS.
  if (!(await haFotoParada(new Date(Date.now() - ESPERA_FOTO_PRESA_MS)))) {
    return Response.json({ vazia: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const { rodarFilaDeFotos } = await import("@/servicos/fila-de-fotos");
  const resultado = await rodarFilaDeFotos();
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
