import type { NextRequest } from "next/server";
import { z } from "zod";

import { autorizarDownload } from "@/servicos/downloads";

const parametros = z.object({ itemId: z.uuid(), token: z.string().min(20).max(100) });

/** Mesma resposta para todo motivo de recusa, para não revelar se o item ou o pedido existe. */
function indisponivel() {
  return new Response("Download indisponível.", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/download/[itemId]">,
) {
  const { itemId } = await params;
  const dados = parametros.safeParse({
    itemId,
    token: request.nextUrl.searchParams.get("token"),
  });
  if (!dados.success) return indisponivel();

  // Primeiro IP da cadeia de proxies (a Vercel preenche x-forwarded-for).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const url = await autorizarDownload(dados.data.itemId, dados.data.token, ip);
  if (!url) return indisponivel();

  // Redireciona para o endereço temporário do original; nada disso pode ficar em cache.
  // A Referrer-Policy global (next.config.ts) já não envia o caminho com o token a outro site.
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}
