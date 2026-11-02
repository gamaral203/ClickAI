import type { NextRequest } from "next/server";

import { buscarEventoDoFotografo, situacaoDasFotosDoEvento } from "@/dados";
import { ehIdValido } from "@/lib/validacao";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { contaDoPainel, usuarioAtual } from "@/servicos/sessao";

// A consulta leve que a grade repete enquanto há fotos em processamento: só as três contagens, em
// vez de recarregar a página inteira. Só o dono do evento.

function resposta(dados: object, status = 200) {
  return Response.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/painel/eventos/[id]/situacao">,
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
  return resposta(await situacaoDasFotosDoEvento(evento.id));
}
