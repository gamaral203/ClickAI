import type { NextRequest } from "next/server";

import { dispositionDeAnexo } from "@/lib/r2";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { originalDeExemploParaAGestao } from "@/servicos/originais-da-gestao";
import { usuarioAtual } from "@/servicos/sessao";

// Só para os dados de exemplo, fora da produção: entrega a imagem de exemplo como anexo ao gestor
// que baixa pela gestão (o CSP não deixa o navegador buscar o host de exemplo direto). Confere o
// papel e a liberação de novo. Na produção não responde nada: lá os originais saem por URL
// assinada do R2.

function indisponivel() {
  return new Response("Indisponível.", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/gestao/originais/[fotoId]">,
) {
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { fotoId } = await params;
  const original = await originalDeExemploParaAGestao(await usuarioAtual(), {
    fotoId,
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
