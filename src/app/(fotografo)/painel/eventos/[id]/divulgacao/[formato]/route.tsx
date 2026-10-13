import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { buscarEventoDoFotografo, imagemDeCapaDoEvento } from "@/dados";
import {
  areaDaImagem,
  CORES_DE_ARTE,
  desenharArte,
  FORMATOS_DE_ARTE,
  modelosDoFormato,
  type CorDeArte,
  type FormatoDeArte,
  type ModeloDeArte,
} from "@/lib/artes/modelos";
import { urlDoSite } from "@/lib/endereco";
import { formatarPeriodo } from "@/lib/formatar";
import { gerarQrCode } from "@/lib/qrcode";
import { urlPublica } from "@/lib/url-publica";
import { ehIdValido } from "@/lib/validacao";
import { exigirFotografo } from "@/servicos/sessao";

// Arte de divulgação do evento (aba Design do painel): story 1080×1920, feed 1080×1350 e banner
// 1200×630, no modelo e na cor escolhidos (src/lib/artes/modelos.tsx). GET usa a capa do evento
// (ou a primeira foto) de fundo; POST recebe outra imagem (campo `imagem`, já reduzida no
// navegador), só para esta arte: nada é gravado. Só o dono do evento gera, e só de evento
// publicado (o QR Code leva à página pública).

/** Plus Jakarta Sans (a fonte do site, licença OFL): o gerador de imagem só traz a regular. */
let fontes: Promise<{ name: string; data: Buffer; weight: 500 | 800; style: "normal" }[]> | null =
  null;
function carregarFontes() {
  fontes ??= Promise.all(
    (
      [
        ["Medium", 500],
        ["ExtraBold", 800],
      ] as const
    ).map(async ([nome, peso]) => ({
      name: "Jakarta",
      data: await readFile(
        path.join(process.cwd(), "src", "lib", "artes", "fontes", `PlusJakartaSans-${nome}.ttf`),
      ),
      weight: peso,
      style: "normal" as const,
    })),
  ).catch((erro) => {
    fontes = null;
    throw erro;
  });
  return fontes;
}

/** Teto da imagem enviada (o navegador manda reduzida, em torno de 1 MB). */
const TETO_IMAGEM = 8 * 1024 * 1024;

function erro(texto: string, status = 404) {
  return new Response(texto, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** A imagem como JPEG em data URL, recortada no tamanho que o modelo usa (o gerador não lê WebP). */
async function recortar(bytes: Buffer | null, largura: number, altura: number) {
  if (!bytes) return null;
  try {
    const jpeg = await sharp(bytes, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize(largura, altura, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Bytes da capa: do R2 pela URL pública ou, nos dados de exemplo, da pasta public. */
async function bytesDaCapa(valor: string | null) {
  if (!valor) return null;
  try {
    const url = urlPublica(valor);
    return url.startsWith("/")
      ? await readFile(path.join(process.cwd(), "public", url))
      : Buffer.from(
          await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).arrayBuffer(),
        );
  } catch {
    return null;
  }
}

async function gerar(
  request: Request,
  params: RouteContext<"/painel/eventos/[id]/divulgacao/[formato]">["params"],
  enviada: () => Promise<Buffer | null>,
) {
  const { id, formato: formatoBruto } = await params;
  if (!(formatoBruto in FORMATOS_DE_ARTE) || !ehIdValido(id)) return erro("Não encontrado.");
  const formato = formatoBruto as FormatoDeArte;
  const busca = new URL(request.url).searchParams;
  const modelos = modelosDoFormato(formato);
  const modeloPedido = busca.get("modelo") as ModeloDeArte | null;
  const modelo = modeloPedido && modelos.includes(modeloPedido) ? modeloPedido : modelos[0];
  const corPedida = busca.get("cor") as CorDeArte | null;
  const cor = corPedida && corPedida in CORES_DE_ARTE ? corPedida : "azul";

  const { conta } = await exigirFotografo(`/painel/eventos/${id}`);
  const evento = await buscarEventoDoFotografo(id, conta.id);
  if (!evento || evento.status !== "publicado") {
    return erro("Publique o evento para gerar as artes.");
  }

  const area = areaDaImagem(modelo, formato);
  const url = urlDoSite(`/eventos/${evento.slug}`);
  const propria = await enviada();
  const [{ pngDataUrl }, imagem, fontesDaArte] = await Promise.all([
    gerarQrCode(url),
    (propria ? Promise.resolve(propria) : imagemDeCapaDoEvento(evento.id).then(bytesDaCapa)).then(
      (bytes) => recortar(bytes, area.largura, area.altura),
    ),
    carregarFontes().catch(() => []),
  ]);
  const medidas = FORMATOS_DE_ARTE[formato];
  return new ImageResponse(
    desenharArte({
      formato,
      modelo,
      cor,
      titulo: evento.titulo,
      quando: `${formatarPeriodo(evento.inicioEm, evento.fimEm)} · ${evento.cidade}, ${evento.estado}`,
      fotografo: conta.nomePublico,
      link: url.replace(/^https?:\/\//, ""),
      qr: pngDataUrl,
      imagem,
    }),
    {
      width: medidas.largura,
      height: medidas.altura,
      fonts: fontesDaArte,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${evento.slug}-${formato}-${modelo}.png"`,
      },
    },
  );
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/painel/eventos/[id]/divulgacao/[formato]">,
) {
  return gerar(request, params, async () => null);
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/painel/eventos/[id]/divulgacao/[formato]">,
) {
  let imagem: Buffer | null = null;
  let grande = false;
  const resposta = await gerar(request, params, async () => {
    const dados = await request.formData().catch(() => null);
    const arquivo = dados?.get("imagem");
    if (!(arquivo instanceof Blob) || arquivo.size === 0) return null;
    if (arquivo.size > TETO_IMAGEM) {
      grande = true;
      return null;
    }
    imagem = Buffer.from(await arquivo.arrayBuffer());
    return imagem;
  });
  return grande ? erro("Imagem grande demais. Escolha outra.", 413) : resposta;
}
