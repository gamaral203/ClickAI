import type { NextRequest } from "next/server";

import { dispositionDeAnexo } from "@/lib/r2";
import { originalDeExemploParaODono } from "@/servicos/originais-do-dono";
import { usuarioAtual } from "@/servicos/sessao";

// Só para os dados de exemplo, fora da produção: entrega a imagem de exemplo como anexo ao dono
// do evento que baixa os originais (o CSP não deixa o navegador buscar o host de exemplo
// direto). Na produção não responde nada: lá os originais saem por URL assinada do R2.

function indisponivel() {
  return new Response("Indisponível.", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/painel/originais/[eventoId]/[fotoId]">,
) {
  const { eventoId, fotoId } = await params;
  const original = await originalDeExemploParaODono(await usuarioAtual(), {
    eventoId,
    fotoId,
    modo: request.nextUrl.searchParams.get("modo"),
    liberacao: request.nextUrl.searchParams.get("liberacao"),
  });
  if (!original) return indisponivel();
  const resposta = await fetch(original.url);
  if (!resposta.ok || !resposta.body) return indisponivel();
  return new Response(resposta.body, {
    headers: {
      "Content-Type": resposta.headers.get("content-type") ?? "image/jpeg",
      "Content-Disposition": dispositionDeAnexo(original.nome),
      "Cache-Control": "no-store",
    },
  });
}
