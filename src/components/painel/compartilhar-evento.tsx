"use client";

import { useState } from "react";
import { Check, Copy, Download, MessageCircle, QrCode } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { Visibilidade } from "@/dados/tipos";

type Props = {
  url: string;
  titulo: string;
  slug: string;
  visibilidade: Visibilidade;
  qrSvg: string;
  qrPngDataUrl: string;
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
}: Props) {
  const [copiado, setCopiado] = useState(false);
  const [erroCopia, setErroCopia] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setErroCopia(false);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErroCopia(true);
    }
  }

  const textoWhatsapp = `As fotos de ${titulo} estão no ClicouAí: ${url}`;
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
            <Button type="button" size="touch" variant="outline" onClick={copiar}>
              {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p role="status" className="sr-only">
            {copiado ? "Link copiado" : ""}
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

        <div className="flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(textoWhatsapp)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            <MessageCircle aria-hidden="true" data-icon="inline-start" />
            Enviar no WhatsApp
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
