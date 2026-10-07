import { ImageResponse } from "next/og";

import { buscarEventoDoFotografo } from "@/dados";
import { urlDoSite } from "@/lib/endereco";
import { formatarData } from "@/lib/formatar";
import { gerarQrCode } from "@/lib/qrcode";
import { ehIdValido } from "@/lib/validacao";
import { exigirFotografo } from "@/servicos/sessao";

// Material de divulgação pronto para redes sociais: story (1080×1920) e feed (1080×1350),
// nas cores da marca (docs/marca/marca.md), com o nome do evento, a data, o QR Code e o link.
// Só o dono do evento gera, e só de evento publicado (o link precisa abrir para quem ler).

const FORMATOS = {
  story: { largura: 1080, altura: 1920, qr: 520, titulo: 92 },
  feed: { largura: 1080, altura: 1350, qr: 400, titulo: 76 },
} as const;

const AZUL = "#2362FE";
const LIMAO = "#BCFA34";

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
  const { pngDataUrl } = await gerarQrCode(url);
  const enderecoCurto = url.replace(/^https?:\/\//, "");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 80,
        background: AZUL,
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 56, fontWeight: 800 }}>
        Clicou<span style={{ color: LIMAO }}>Aí</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            background: LIMAO,
            color: "#0b0b0b",
            borderRadius: 999,
            padding: "12px 32px",
            fontSize: 40,
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
            lineHeight: 1.1,
            maxWidth: 920,
            justifyContent: "center",
          }}
        >
          {evento.titulo}
        </div>
        <div style={{ display: "flex", fontSize: 40, opacity: 0.9 }}>
          {formatarData(evento.inicioEm)} · {evento.cidade}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <div style={{ display: "flex", background: "white", borderRadius: 32, padding: 24 }}>
          {/* QR Code gerado aqui no servidor a partir do link do evento. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pngDataUrl} width={medidas.qr} height={medidas.qr} alt="" />
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
          Encontre as suas com uma selfie
        </div>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.85 }}>{enderecoCurto}</div>
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
