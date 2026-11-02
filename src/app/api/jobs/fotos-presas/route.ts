import type { NextRequest } from "next/server";

import { chamadaDeJobAutorizada } from "@/lib/cron";

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
  // Importado só aqui: a chamada sem trabalho, a mais comum, responde sem carregar Sharp e AWS.
  const { rodarFilaDeFotos } = await import("@/servicos/fila-de-fotos");
  const resultado = await rodarFilaDeFotos();
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
