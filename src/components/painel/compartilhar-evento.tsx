"use client";

import { useState } from "react";
import { Check, Copy, Download, ImageDown, MessageCircle, QrCode } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { Visibilidade } from "@/dados/tipos";

type Props = {
  url: string;
  titulo: string;
  slug: string;
  visibilidade: Visibilidade;
  qrSvg: string;
  qrPngDataUrl: string;
  /** Para os links das imagens de story e feed (rota do painel, só o dono gera). */
  eventoId: string;
};

const AVISO: Record<Visibilidade, string | null> = {
  publico: null,
  nao_listado: "O evento não aparece na lista do site: só quem tiver este link encontra as fotos.",
  senha: "O link não leva a senha. Envie a senha junto, só para quem pode ver as fotos.",
};

/**
 * Divulgação do evento publicado: link para copiar, WhatsApp e QR Code para imprimir no local
 * (cartaz, mesa de inscrição, telão). O QR Code chega pronto do servidor.
 */
export function CompartilharEvento({
  url,
  titulo,
  slug,
  visibilidade,
  qrSvg,
  qrPngDataUrl,
  eventoId,
}: Props) {
  const [copiado, setCopiado] = useState<"link" | "mensagem" | null>(null);
  const [erroCopia, setErroCopia] = useState(false);
  const [mensagem, setMensagem] = useState(
    `📸 As fotos de ${titulo} já estão no ClicouAí!\n\nTire uma selfie e encontre as suas em segundos: ${url}`,
  );

  async function copiar(texto: string, qual: "link" | "mensagem") {
    try {
      await navigator.clipboard.writeText(texto);
      setErroCopia(false);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      setErroCopia(true);
    }
  }

  const aviso = AVISO[visibilidade];

  return (
    <section
      aria-labelledby="titulo-compartilhar"
      className="flex flex-col gap-5 rounded-xl border p-5 sm:flex-row sm:items-start"
    >
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-compartilhar" className="text-lg font-semibold">
            Divulgue o evento
          </h2>
          <p className="text-sm text-muted-foreground">
            Mande o link para os participantes ou imprima o QR Code para deixar no local.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="link-evento" className="text-sm font-medium">
            Link do evento
          </label>
          <div className="flex gap-2">
            <input
              id="link-evento"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-muted/50 px-3 text-sm"
            />
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={() => copiar(url, "link")}
            >
              {copiado === "link" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copiado === "link" ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p role="status" className="sr-only">
            {copiado === "link" ? "Link copiado" : copiado === "mensagem" ? "Mensagem copiada" : ""}
          </p>
          {erroCopia && (
            <p role="alert" className="text-sm text-destructive">
              Não deu para copiar. Selecione o link e copie manualmente.
            </p>
          )}
        </div>

        {aviso && (
          <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">{aviso}</p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="mensagem-evento" className="text-sm font-medium">
            Mensagem pronta (dá para editar)
          </label>
          <textarea
            id="mensagem-evento"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={4}
            maxLength={1000}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "touch" })}
            >
              <MessageCircle aria-hidden="true" data-icon="inline-start" />
              Enviar no WhatsApp
            </a>
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={() => copiar(mensagem, "mensagem")}
            >
              {copiado === "mensagem" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copiado === "mensagem" ? "Copiada" : "Copiar mensagem"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Material para redes sociais e impressão</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/painel/eventos/${eventoId}/divulgacao/story`}
              download={`${slug}-story.png`}
              className={buttonVariants({ variant: "outline", size: "touch" })}
            >
              <ImageDown aria-hidden="true" data-icon="inline-start" />
              Story (1080×1920)
            </a>
            <a
              href={`/painel/eventos/${eventoId}/divulgacao/feed`}
              download={`${slug}-feed.png`}
              className={buttonVariants({ variant: "outline", size: "touch" })}
            >
              <ImageDown aria-hidden="true" data-icon="inline-start" />
              Feed (1080×1350)
            </a>
            <a
              href={qrPngDataUrl}
              download={`qrcode-${slug}.png`}
              className={buttonVariants({ variant: "outline", size: "touch" })}
            >
              <Download aria-hidden="true" data-icon="inline-start" />
              Baixar QR Code
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            As imagens saem nas cores do ClicouAí, com o nome do evento, a data e o QR Code.
          </p>
        </div>
      </div>

      <figure className="flex flex-col items-center gap-2 self-center sm:self-start">
        <div
          role="img"
          aria-label={`QR Code com o link de ${titulo}`}
          className="size-40 rounded-lg border bg-white p-1 [&_svg]:size-full"
          // SVG gerado no servidor pela biblioteca qrcode a partir do nosso próprio link.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <figcaption className="flex items-center gap-1 text-xs text-muted-foreground">
          <QrCode aria-hidden="true" className="size-3.5" />
          Aponte a câmera do celular
        </figcaption>
      </figure>
    </section>
  );
}
