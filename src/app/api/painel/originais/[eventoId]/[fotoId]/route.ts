import { after, type NextRequest } from "next/server";

import { dispositionDeAnexo } from "@/lib/r2";
import {
  originalDeExemploParaODono,
  originalEmFluxoParaOAutor,
} from "@/servicos/originais-do-dono";
import { respostaDoOriginalEmFluxo } from "@/servicos/original-da-foto";
import { usuarioAtual } from "@/servicos/sessao";
import { respostaDaManutencao } from "@/servicos/manutencao";

// Entrega ao AUTOR um original que não sai por URL assinada do R2 (src/servicos/originais-do-dono.ts):
//   - `?fluxo=`: original guardado no Google Drive (evento `hibrido`, protótipo). O endereço foi
//     emitido pelo lote ou pela foto individual depois das conferências de sempre (dono ou
//     autor, liberação com a verificação em duas etapas, limite) e vale 15 minutos, preso ao
//     usuário e à foto; aqui a sessão, o token e a autoria são conferidos de novo e o arquivo
//     passa em streaming (com Range). Nada do Drive sai na resposta.
//   - `?modo=&liberacao=`: só para os dados de exemplo, fora da produção: a imagem de exemplo
//     como anexo (o CSP não deixa o navegador buscar o host de exemplo direto).

/** Um original grande (vídeo de 300 MB) em streaming pode levar minutos. */
export const maxDuration = 300;

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
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { eventoId, fotoId } = await params;
  const busca = request.nextUrl.searchParams;

  const fluxo = busca.get("fluxo");
  if (fluxo !== null) {
    const original = await originalEmFluxoParaOAutor(await usuarioAtual(), {
      eventoId,
      fotoId,
      fluxo,
    });
    // 403: o motor do download (src/lib/baixar-originais.ts) pede um endereço novo e tenta de novo.
    if (!original) {
      return new Response("Endereço vencido ou recusado.", {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const resposta = await respostaDoOriginalEmFluxo({
      foto: original.foto,
      nomeArquivo: original.nome,
      tipoMime: original.tipoMime,
      range: request.headers.get("range"),
      operacao: "leitura_original",
      depois: (tarefa) => after(tarefa),
      fotoId: original.fotoId,
      eventoId: original.eventoId,
    });
    return resposta ?? indisponivel();
  }

  const original = await originalDeExemploParaODono(await usuarioAtual(), {
    eventoId,
    fotoId,
    modo: busca.get("modo"),
    liberacao: busca.get("liberacao"),
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
