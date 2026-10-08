import type { NextRequest } from "next/server";
import { z } from "zod";

import { dispositionDeAnexo } from "@/lib/r2";
import { autorizarDownload } from "@/servicos/downloads";
import { limiteAtingido } from "@/servicos/limites";
import { usuarioAtual } from "@/servicos/sessao";

// Token do link (convidado) ou sessão (cliente logado); um dos dois é conferido no serviço.
const parametros = z.object({ itemId: z.uuid(), token: z.string().min(20).max(400).nullable() });

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
  // Limite de URLs assinadas por IP, contado no banco: segura quem tenta varrer ids ou tokens.
  if (await limiteAtingido("url_download_ip", ip ?? "local")) {
    return new Response("Muitos downloads seguidos. Espere alguns minutos e tente de novo.", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const usuario = await usuarioAtual();
  const original = await autorizarDownload(
    dados.data.itemId,
    { token: dados.data.token, clienteId: usuario?.id },
    ip,
  );
  if (!original) return indisponivel();

  // Foto enviada: redireciona para a URL assinada do R2 (~15 min), gerada com
  // Content-Disposition de anexo e o nome do arquivo. O original não passa pelo Next.js.
  if (original.tipo === "r2") {
    return new Response(null, {
      status: 302,
      headers: { Location: original.url, "Cache-Control": "no-store" },
    });
  }

  // Dados de exemplo (fora da produção): o servidor busca a imagem de exemplo e entrega como
  // anexo, para o navegador salvar o arquivo em vez de abrir a foto numa aba.
  const resposta = await fetch(original.url);
  if (!resposta.ok || !resposta.body) return indisponivel();

  return new Response(resposta.body, {
    headers: {
      "Content-Type": resposta.headers.get("content-type") ?? "image/jpeg",
      "Content-Disposition": dispositionDeAnexo(original.nomeArquivo),
      "Cache-Control": "no-store",
    },
  });
}
