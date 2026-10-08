import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  buscarEventoPublicado,
  caixasDosRostos,
  fotosEncontradas,
  rostosDeExemploDoEvento,
} from "@/dados";
import { BuscaFacialDesligada, buscarFotosPorSelfie } from "@/lib/reconhecimento";
import { ofertaDePacote } from "@/servicos/pacotes";

// Busca por selfie (docs/arquitetura.md, "Galeria e busca"). A selfie é dado biométrico
// (LGPD, dado pessoal sensível): só é aceita com consentimento, fica só na memória desta
// requisição, vai ao provedor para a comparação e é descartada. Nunca gravar nem logar o
// corpo desta rota.

/** O navegador já reduz a selfie; 5 MB é folga para quem envia direto. */
const TAMANHO_MAXIMO = 5 * 1024 * 1024;
/** Tentativas por IP numa janela de 10 minutos (docs/riscos.md, falso positivo e custo). */
const LIMITE_TENTATIVAS = 10;
const JANELA_MS = 10 * 60 * 1000;
const tentativas = new Map<string, number[]>();

function limiteAtingido(ip: string) {
  const agora = Date.now();
  const recentes = (tentativas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  tentativas.set(ip, recentes);
  return recentes.length > LIMITE_TENTATIVAS;
}

/** Confere o tipo pelo conteúdo (JPEG, PNG ou WebP), não pela extensão nem pelo navegador. */
function ehImagem(bytes: Uint8Array) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return jpeg || png || webp;
}

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
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limiteAtingido(ip)) {
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
    const { fotoIds, rostoIds } = await buscarFotosPorSelfie(evento.id, selfie, () =>
      rostosDeExemploDoEvento(evento.id),
    );
    const fotos = await fotosEncontradas(evento.id, fotoIds);
    // Onde está o rosto da pessoa em cada foto: a tela amplia a miniatura nele.
    const recortes = await caixasDosRostos(rostoIds);
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
