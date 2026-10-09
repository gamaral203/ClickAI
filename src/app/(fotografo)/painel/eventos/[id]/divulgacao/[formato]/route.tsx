import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { buscarEventoDoFotografo, imagemDeCapaDoEvento } from "@/dados";
import { urlDoSite } from "@/lib/endereco";
import { formatarData } from "@/lib/formatar";
import { gerarQrCode } from "@/lib/qrcode";
import { urlPublica } from "@/lib/url-publica";
import { ehIdValido } from "@/lib/validacao";
import { exigirFotografo } from "@/servicos/sessao";

// Material de divulgação pronto para redes sociais: story (1080×1920) e feed (1080×1350). A capa
// do evento (ou a primeira foto) fica de fundo, com um véu escuro para o texto ler bem; o título
// vem em cima e o QR Code, menor, embaixo, junto com o link. Sem foto, o fundo é o azul da marca
// (docs/marca/marca.md). Só o dono do evento gera, e só de evento publicado.

const FORMATOS = {
  story: { largura: 1080, altura: 1920, qr: 260, titulo: 96 },
  feed: { largura: 1080, altura: 1350, qr: 220, titulo: 80 },
} as const;

const AZUL = "#2362FE";
const LIMAO = "#BCFA34";

/**
 * A imagem de fundo como JPEG em data URL, já recortada no tamanho do formato (o gerador de
 * imagem não lê WebP). Lê do R2 pela URL pública ou, nos dados de exemplo, da pasta public.
 * Qualquer falha devolve `null` e o fundo fica azul.
 */
async function fundo(valor: string | null, largura: number, altura: number) {
  if (!valor) return null;
  try {
    const url = urlPublica(valor);
    const bytes = url.startsWith("/")
      ? await readFile(path.join(process.cwd(), "public", url))
      : Buffer.from(
          await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).arrayBuffer(),
        );
    const jpeg = await sharp(bytes)
      .resize(largura, altura, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/painel/eventos/[id]/divulgacao/[formato]">,
) {
  const { id, formato } = await params;
  const medidas = FORMATOS[formato as keyof typeof FORMATOS];
  if (!medidas || !ehIdValido(id)) return new Response("Não encontrado.", { status: 404 });

  const { conta } = await exigirFotografo(`/painel/eventos/${id}`);
  const evento = await buscarEventoDoFotografo(id, conta.id);
  if (!evento || evento.status !== "publicado") {
    return new Response("Publique o evento para gerar o material.", { status: 404 });
  }

  const url = urlDoSite(`/eventos/${evento.slug}`);
  const [{ pngDataUrl }, imagem] = await Promise.all([
    gerarQrCode(url),
    imagemDeCapaDoEvento(evento.id).then((v) => fundo(v, medidas.largura, medidas.altura)),
  ]);
  const enderecoCurto = url.replace(/^https?:\/\//, "");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: AZUL,
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      {imagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagem}
          width={medidas.largura}
          height={medidas.altura}
          alt=""
          style={{ position: "absolute", top: 0, left: 0 }}
        />
      )}
      {/* Véu escuro em cima e embaixo: o texto lê bem sobre qualquer foto. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          background: imagem
            ? "linear-gradient(180deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.85) 100%)"
            : "transparent",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
        }}
      >
        {/* Em cima: marca, chamada, título e data. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800 }}>
            Clicou<span style={{ color: LIMAO }}>Aí</span>
          </div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              background: LIMAO,
              color: "#0b0b0b",
              borderRadius: 999,
              padding: "10px 28px",
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            As fotos chegaram!
          </div>
          <div
            style={{
              display: "flex",
              fontSize: medidas.titulo,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: 940,
            }}
          >
            {evento.titulo}
          </div>
          <div style={{ display: "flex", fontSize: 38, opacity: 0.9 }}>
            {formatarData(evento.inicioEm)} · {evento.cidade}
          </div>
        </div>

        {/* Embaixo: QR Code menor, com a chamada e o link ao lado. */}
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ display: "flex", background: "white", borderRadius: 28, padding: 18 }}>
            {/* QR Code gerado aqui no servidor a partir do link do evento. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pngDataUrl} width={medidas.qr} height={medidas.qr} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>
              Encontre as suas com uma selfie
            </div>
            <div style={{ display: "flex", fontSize: 30, opacity: 0.9 }}>
              Aponte a câmera para o QR Code ou acesse:
            </div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: LIMAO }}>
              {enderecoCurto}
            </div>
          </div>
        </div>
      </div>
    </div>,
    {
      width: medidas.largura,
      height: medidas.altura,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${evento.slug}-${formato}.png"`,
      },
    },
  );
}
