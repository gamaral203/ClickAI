import type { NextRequest } from "next/server";
import { z } from "zod";

import { autorizarDownload } from "@/servicos/downloads";
import { usuarioAtual } from "@/servicos/sessao";

// Token do link (convidado) ou sessão (cliente logado); um dos dois é conferido no serviço.
const parametros = z.object({ itemId: z.uuid(), token: z.string().min(20).max(100).nullable() });

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
  const usuario = await usuarioAtual();
  const original = await autorizarDownload(
    dados.data.itemId,
    { token: dados.data.token, clienteId: usuario?.id },
    ip,
  );
  if (!original) return indisponivel();

  // Parte A: o servidor busca a imagem de exemplo e entrega como anexo, para o navegador
  // salvar o arquivo em vez de abrir a foto numa aba. Na Fase 12 isto vira um redirecionamento
  // para a URL assinada do R2, gerada já com Content-Disposition de anexo e o mesmo nome.
  const resposta = await fetch(original.url);
  if (!resposta.ok || !resposta.body) return indisponivel();

  return new Response(resposta.body, {
    headers: {
      "Content-Type": resposta.headers.get("content-type") ?? "image/jpeg",
      "Content-Disposition": anexo(original.nomeArquivo),
      "Cache-Control": "no-store",
    },
  });
}

/** Content-Disposition de anexo, com nome ASCII de reserva e o nome completo em UTF-8. */
function anexo(nome: string) {
  const ascii = nome.normalize("NFD").replace(/[^\w.-]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
