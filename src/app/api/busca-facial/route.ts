import { after, type NextRequest } from "next/server";
import { z } from "zod";

import {
  buscarEventoPublicado,
  caixasDosRostos,
  contarUso,
  fotosEncontradas,
  pedirReindexacao,
  registrarBuscaNosEventos,
  rostosDeExemploDoEvento,
  situacaoDaColecao,
} from "@/dados";
import {
  ehImagemDaBusca as ehImagem,
  TAMANHO_MAXIMO_SELFIE as TAMANHO_MAXIMO,
} from "@/lib/imagem-da-busca";
import { CONTADOR } from "@/lib/painel-de-uso";
import {
  BuscaFacialDesligada,
  buscarFotosPorSelfie,
  nomeDoErro,
  provedorFacial,
} from "@/lib/reconhecimento";
import { reindexarEventoArquivado } from "@/servicos/colecoes";
import { limiteDoIpAtingido } from "@/servicos/limites";
import { ofertaDePacote } from "@/servicos/pacotes";
import { respostaDaManutencao } from "@/servicos/manutencao";

// Busca por selfie (docs/arquitetura.md, "Galeria e busca"). A selfie é dado biométrico
// (LGPD, dado pessoal sensível): só é aceita com consentimento, fica só na memória desta
// requisição, vai ao provedor para a comparação e é descartada. Nunca gravar nem logar o
// corpo desta rota.
//
// Evento com os rostos arquivados por inatividade (src/servicos/colecoes.ts): a selfie não vai ao
// provedor (a coleção não existe mais). A rota pede a reindexação, começa a fazê-la depois da
// resposta (`after`) e responde 202 com `preparando`, para a tela avisar em vez de dar erro.

// A reindexação disparada pela busca roda depois da resposta, dentro deste tempo.
export const maxDuration = 300;
/** Quanto da função a reindexação usa depois da resposta (o resto fica para a busca seguinte). */
const PRAZO_DA_REINDEXACAO_MS = 240 * 1000;

const campos = z.object({
  slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  consentimento: z.literal("sim"),
});

function resposta(corpo: object, status = 200) {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  // Limite por IP no banco (vale entre todos os servidores), contado antes de ler o corpo: a
  // selfie não entra na chave nem é lida se a pessoa passou do limite.
  if (await limiteDoIpAtingido("busca_facial_ip")) {
    return resposta(
      { erro: "Muitas buscas seguidas. Espere alguns minutos e tente de novo." },
      429,
    );
  }

  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > TAMANHO_MAXIMO + 64 * 1024) {
    return resposta({ erro: "A foto é grande demais. Tente de novo." }, 413);
  }

  const formulario = await request.formData().catch(() => null);
  const dados = campos.safeParse({
    slug: formulario?.get("slug"),
    consentimento: formulario?.get("consentimento"),
  });
  const arquivo = formulario?.get("selfie");
  if (!dados.success || !(arquivo instanceof Blob)) {
    return resposta({ erro: "Aceite o aviso e tire ou escolha uma selfie." }, 400);
  }
  if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO) {
    return resposta({ erro: "A foto é grande demais. Tente de novo." }, 413);
  }
  const selfie = new Uint8Array(await arquivo.arrayBuffer());
  if (!ehImagem(selfie)) {
    return resposta({ erro: "Envie uma foto em JPEG, PNG ou WebP." }, 400);
  }

  const evento = await buscarEventoPublicado(dados.data.slug);
  if (!evento) return resposta({ erro: "Evento não encontrado." }, 404);

  try {
    if (provedorFacial() === "rekognition" && (await situacaoDaColecao(evento.id)).arquivadaEm) {
      await pedirReindexacao(evento.id, new Date());
      after(() =>
        reindexarEventoArquivado(evento.id, PRAZO_DA_REINDEXACAO_MS).catch((erro) =>
          console.error(
            `[busca-facial] falha ao reindexar o evento ${evento.id}: ${nomeDoErro(erro)}`,
          ),
        ),
      );
      return resposta(
        {
          preparando: true,
          mensagem:
            "Estamos preparando a busca por selfie deste evento, que ficou um tempo parado. " +
            "Tente de novo em alguns minutos.",
        },
        202,
      );
    }
    const { fotoIds, rostoIds } = await buscarFotosPorSelfie(evento.id, selfie, () =>
      rostosDeExemploDoEvento(evento.id),
    );
    // Contador anônimo do Painel de uso: só "mais uma busca hoje", sem evento, IP nem selfie.
    await contarUso(CONTADOR.buscaSelfie);
    // Atividade do evento (adia o arquivamento da coleção): só a hora, nada da busca.
    await registrarBuscaNosEventos([evento.id], new Date()).catch((erro) =>
      console.error(`[busca-facial] falha ao registrar a busca: ${nomeDoErro(erro)}`),
    );
    const fotos = await fotosEncontradas(evento.id, fotoIds);
    // Onde está o rosto da pessoa em cada foto: a tela amplia a miniatura nele.
    // Só das fotos devolvidas: foto ainda não liberada não aparece nem pelo id.
    const devolvidas = new Set(fotos.map((f) => f.id));
    const recortes = Object.fromEntries(
      Object.entries(await caixasDosRostos(rostoIds)).filter(([fotoId]) => devolvidas.has(fotoId)),
    );
    return resposta({ fotos, recortes, pacote: await ofertaDePacote(evento, fotos) });
  } catch (erro) {
    if (erro instanceof BuscaFacialDesligada) {
      console.error(
        "[busca-facial] desligada: faltam REKOGNITION_REGIAO, REKOGNITION_ACCESS_KEY_ID ou REKOGNITION_SECRET_ACCESS_KEY",
      );
      return resposta(
        {
          erro: "A busca por selfie está indisponível agora. Use o número de peito ou veja a galeria.",
        },
        503,
      );
    }
    return resposta({ erro: "A busca falhou. Tente de novo em instantes." }, 502);
  } finally {
    // Some com a selfie assim que possível, mesmo que o coletor de lixo ainda não tenha passado.
    selfie.fill(0);
  }
}
