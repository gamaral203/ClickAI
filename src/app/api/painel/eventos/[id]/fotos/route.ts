import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  buscarEventoDoFotografo,
  contagensDoPainel,
  eventoTemDataDeCaptura,
  idsDoFiltroDoPainel,
  situacaoDosNumeros,
} from "@/dados";
import { filtroDaUrl } from "@/lib/filtro-painel";
import { ehIdValido } from "@/lib/validacao";
import {
  FOTOS_DA_GRADE_NO_MAXIMO,
  FOTOS_DA_GRADE_POR_VEZ,
  itensDaGrade,
} from "@/servicos/grade-do-painel";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { contaDoPainel, usuarioAtual } from "@/servicos/sessao";

// Página da grade de fotos do painel do evento, com os filtros e as contagens. Só o dono do evento:
// evento de outra conta responde 404, igual a um id que não existe. Só leva prévias protegidas.

const paginacao = z.object({
  desde: z.coerce.number().int().min(0).default(0),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(FOTOS_DA_GRADE_NO_MAXIMO)
    .default(FOTOS_DA_GRADE_POR_VEZ),
});

function resposta(dados: object, status = 200) {
  return Response.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/painel/eventos/[id]/fotos">,
) {
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const usuario = await usuarioAtual();
  if (!usuario) return resposta({ erro: "Entre de novo para continuar." }, 401);
  const conta = await contaDoPainel(usuario);
  if (!conta) return resposta({ erro: "Sem acesso ao painel." }, 403);
  const { id } = await params;
  const evento = ehIdValido(id) ? await buscarEventoDoFotografo(id, conta.id) : null;
  if (!evento) return resposta({ erro: "Evento não encontrado." }, 404);

  const url = request.nextUrl.searchParams;
  const pagina = paginacao.safeParse({
    desde: url.get("desde") ?? undefined,
    limite: url.get("limite") ?? undefined,
  });
  if (!pagina.success) return resposta({ erro: "Pedido inválido." }, 400);
  const agora = Date.now();
  const basePadrao = (await eventoTemDataDeCaptura(evento.id)) ? "captura" : "envio";
  const filtro = filtroDaUrl(url, basePadrao);

  if (url.get("ids") === "1") {
    return resposta({ itens: await idsDoFiltroDoPainel(evento.id, filtro, agora) });
  }
  const numeros = await situacaoDosNumeros(evento.id);
  const [itens, contagens] = await Promise.all([
    itensDaGrade(evento, conta.id, filtro, agora, {
      ...pagina.data,
      comNumero: numeros.comNumero > 0,
    }),
    contagensDoPainel(evento.id, filtro, agora),
  ]);
  return resposta({ itens, contagens, agora, temCaptura: basePadrao === "captura" });
}
