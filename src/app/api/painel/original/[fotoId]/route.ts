import type { NextRequest } from "next/server";

import { dispositionDeAnexo } from "@/lib/r2";
import { ipDaRequisicao } from "@/servicos/limites";
import { originalIndividual } from "@/servicos/originais-do-dono";
import { usuarioAtual } from "@/servicos/sessao";

// Original de UMA foto para o autor dela (dono do evento ou colaborador), pelo botão "Baixar
// original" do painel (docs/CLAUDE.md, exceção do autor; src/servicos/originais-do-dono.ts).
// Tudo é conferido no servidor (sessão, autoria, liberação do evento com a verificação em duas
// etapas, limite por usuário) e a resposta é um 302 para a URL assinada do R2 (~15 min, como
// anexo): o arquivo nunca passa pelo Next.js. Só os dados de exemplo, fora da produção, saem por
// aqui (o CSP não deixa o navegador buscar o host de exemplo direto).

const MENSAGENS = {
  nao_encontrado: { status: 404, texto: "Foto não encontrada." },
  liberacao: {
    status: 403,
    texto: "A liberação do download venceu. Volte ao painel e clique em Baixar original de novo.",
  },
  limite: { status: 429, texto: "Muitos downloads seguidos. Espere alguns minutos." },
  indisponivel: { status: 404, texto: "O original desta foto não está disponível." },
} as const;

function texto(status: number, corpo: string) {
  return new Response(corpo, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/painel/original/[fotoId]">,
) {
  const { fotoId } = await params;
  const resultado = await originalIndividual(
    await usuarioAtual(),
    { fotoId, liberacao: request.nextUrl.searchParams.get("liberacao") },
    await ipDaRequisicao(),
  );
  if (!resultado.ok) {
    const { status, texto: corpo } = MENSAGENS[resultado.motivo];
    return texto(status, corpo);
  }
  if (!resultado.exemplo) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: resultado.url,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  const resposta = await fetch(resultado.url);
  if (!resposta.ok || !resposta.body) return texto(404, MENSAGENS.indisponivel.texto);
  return new Response(resposta.body, {
    headers: {
      "Content-Type": resposta.headers.get("content-type") ?? "image/jpeg",
      "Content-Disposition": dispositionDeAnexo(resultado.nome),
      "Cache-Control": "no-store",
    },
  });
}
