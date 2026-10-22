import type { NextRequest } from "next/server";

import { dispositionDeAnexo } from "@/lib/r2";
import { ipDaRequisicao } from "@/servicos/limites";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { originalIndividualDaGestao } from "@/servicos/originais-da-gestao";
import { usuarioAtual } from "@/servicos/sessao";

// Original de UMA foto para a gestão, pelo botão "Baixar original" de /admin/eventos/[id]
// (docs/CLAUDE.md, exceção da gestão; src/servicos/originais-da-gestao.ts). Tudo é conferido no
// servidor (papel de gestor, foto existente e pronta, liberação com o código do e-mail se o MFA
// estiver ligado, limite por gestor, auditoria) e a resposta é um 302 para a URL assinada do R2
// (~15 min, como anexo): o arquivo nunca passa pelo Next.js. Fotógrafo, cliente e visitante
// recebem 404, sem saber se a foto existe. Só os dados de exemplo, fora da produção, saem por
// aqui (o CSP não deixa o navegador buscar o host de exemplo direto).
//
// Com `formato=json` (o botão da gestão), a resposta é a URL em JSON, ou o erro em JSON com o
// mesmo status. A URL assinada nunca vai para o log.

const MENSAGENS = {
  nao_encontrado: { status: 404, texto: "Foto não encontrada." },
  liberacao: {
    status: 403,
    texto: "A liberação do download venceu. Clique em Baixar original de novo.",
  },
  limite: { status: 429, texto: "Muitos downloads seguidos. Espere alguns minutos." },
  indisponivel: { status: 404, texto: "O original desta foto não está disponível." },
} as const;

const SEM_CACHE = { "Cache-Control": "no-store" };

function texto(status: number, corpo: string) {
  return new Response(corpo, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/gestao/original/[fotoId]">,
) {
  // Modo de manutenção: o gestor passa; os outros já seriam recusados de qualquer forma.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { fotoId } = await params;
  const liberacao = request.nextUrl.searchParams.get("liberacao");
  const json = request.nextUrl.searchParams.get("formato") === "json";
  const resultado = await originalIndividualDaGestao(
    await usuarioAtual(),
    { fotoId, liberacao },
    await ipDaRequisicao(),
  );
  if (!resultado.ok) {
    const { status, texto: corpo } = MENSAGENS[resultado.motivo];
    return json
      ? Response.json({ erro: corpo }, { status, headers: SEM_CACHE })
      : texto(status, corpo);
  }
  if (resultado.exemplo) {
    // Exemplo: entrega a imagem como anexo por esta rota (já conferida e registrada).
    if (json) {
      return Response.json(
        {
          url: `/api/gestao/originais/${fotoId}?${new URLSearchParams({ liberacao: liberacao ?? "" })}`,
        },
        { headers: SEM_CACHE },
      );
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
  if (json) return Response.json({ url: resultado.url }, { headers: SEM_CACHE });
  return new Response(null, {
    status: 302,
    headers: {
      Location: resultado.url,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
