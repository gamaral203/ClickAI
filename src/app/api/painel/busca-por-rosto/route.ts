import type { NextRequest } from "next/server";
import { z } from "zod";

import { ehImagemDaBusca, TAMANHO_MAXIMO_SELFIE } from "@/lib/imagem-da-busca";
import { vemDoMesmoSite } from "@/lib/mesma-origem";
import { buscarPorRostoNoPainel, escopoDaBusca } from "@/servicos/busca-por-rosto";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { usuarioAtual } from "@/servicos/sessao";

// Busca por rosto no painel do fotógrafo (src/servicos/busca-por-rosto.ts). A foto enviada é
// dado biométrico de outra pessoa (LGPD, dado pessoal sensível): só é aceita com a confirmação de
// que o fotógrafo tem a autorização dela, fica só na memória desta requisição, vai ao provedor
// para a comparação e é descartada. Nunca gravar nem logar o corpo desta rota.

const campos = z.object({
  escopo: z.enum(["evento", "recentes"]),
  eventoId: z.string().max(64).optional(),
  autorizacao: z.literal("sim"),
});

const MENSAGENS = {
  nao_encontrado: { status: 404, erro: "Entre com a sua conta de fotógrafo para buscar." },
  escopo: { status: 404, erro: "Evento não encontrado entre os seus." },
  limite: { status: 429, erro: "Muitas buscas seguidas. Espere um pouco e tente de novo." },
  desligada: { status: 503, erro: "A busca por rosto está indisponível agora." },
  falha: { status: 502, erro: "A busca falhou. Tente de novo em instantes." },
} as const;

function resposta(corpo: object, status = 200) {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  if (!vemDoMesmoSite(request)) return resposta({ erro: "Pedido recusado." }, 403);
  // Sem sessão, recusa antes de ler o corpo: a imagem nem é lida.
  const usuario = await usuarioAtual();
  if (!usuario) return resposta({ erro: MENSAGENS.nao_encontrado.erro }, 401);

  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > TAMANHO_MAXIMO_SELFIE + 64 * 1024) {
    return resposta({ erro: "A foto é grande demais. Tente de novo." }, 413);
  }
  const formulario = await request.formData().catch(() => null);
  const dados = campos.safeParse({
    escopo: formulario?.get("escopo"),
    eventoId: formulario?.get("eventoId") ?? undefined,
    autorizacao: formulario?.get("autorizacao"),
  });
  const arquivo = formulario?.get("foto");
  if (!dados.success || !(arquivo instanceof Blob)) {
    return resposta(
      { erro: "Confirme que tem a autorização da pessoa e escolha uma foto do rosto." },
      400,
    );
  }
  const escopo = escopoDaBusca.safeParse(
    dados.data.escopo === "evento"
      ? { tipo: "evento", eventoId: dados.data.eventoId }
      : { tipo: "recentes" },
  );
  if (!escopo.success) return resposta({ erro: MENSAGENS.escopo.erro }, 404);
  if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_SELFIE) {
    return resposta({ erro: "A foto é grande demais. Tente de novo." }, 413);
  }
  const imagem = new Uint8Array(await arquivo.arrayBuffer());
  try {
    if (!ehImagemDaBusca(imagem)) {
      return resposta({ erro: "Envie uma foto em JPEG, PNG ou WebP." }, 400);
    }
    const resultado = await buscarPorRostoNoPainel(usuario, escopo.data, imagem);
    if (!resultado.ok) {
      const { status, erro } = MENSAGENS[resultado.motivo];
      return resposta({ erro }, status);
    }
    return resposta({ grupos: resultado.grupos, eventosConsultados: resultado.eventosConsultados });
  } finally {
    // Some com a imagem assim que possível, mesmo que o coletor de lixo ainda não tenha passado.
    imagem.fill(0);
  }
}
