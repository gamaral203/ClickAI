"use client";

import { useEffect, useState } from "react";
import { Check, Copy, FolderDown, Loader2, MailCheck, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { lembrarPedido } from "@/lib/pedidos-no-aparelho";

type Arquivo = { url: string; nome: string };

const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/tiff": "tif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

/**
 * O que segura o cliente na página do pedido pago: o aviso de guardar o link (e para qual e-mail
 * ele foi), "Baixar todas (ZIP)", "Copiar link" e "Me enviar no WhatsApp" (abre o WhatsApp da
 * pessoa com o link pronto). Também lembra o pedido neste navegador, para a faixa "Você tem fotos
 * compradas" aparecer quando ela voltar ao site.
 */
export function AcessoAoPedido({
  pedidoId,
  link,
  email,
  pagoEm,
  eventos,
  arquivos,
}: {
  pedidoId: string;
  /** Link assinado da página do pedido (o mesmo do e-mail). */
  link: string;
  email: string;
  pagoEm: string;
  eventos: string[];
  arquivos: Arquivo[];
}) {
  const [copiado, setCopiado] = useState(false);
  const [zip, setZip] = useState<{ feitos: number } | null>(null);
  const [erroZip, setErroZip] = useState<string | null>(null);

  useEffect(() => {
    lembrarPedido({ id: pedidoId, link, pagoEm, fotos: arquivos.length, eventos });
  }, [pedidoId, link, pagoEm, arquivos.length, eventos]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão: o botão do WhatsApp continua funcionando.
    }
  }

  async function baixarZip() {
    setErroZip(null);
    setZip({ feitos: 0 });
    try {
      const { downloadZip } = await import("client-zip");
      const usados = new Set<string>();
      async function* entradas() {
        for (const [i, arquivo] of arquivos.entries()) {
          const resposta = await fetch(arquivo.url);
          if (!resposta.ok) throw new Error("download");
          const tipo = (resposta.headers.get("content-type") ?? "").split(";")[0];
          let nome = `${arquivo.nome}.${EXTENSAO[tipo] ?? "jpg"}`;
          if (usados.has(nome)) nome = `${arquivo.nome}-${i + 1}.${EXTENSAO[tipo] ?? "jpg"}`;
          usados.add(nome);
          yield { name: nome, input: resposta, lastModified: new Date() };
          setZip({ feitos: i + 1 });
        }
      }
      const blob = await downloadZip(entradas()).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "minhas-fotos-clicouai.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErroZip("Não deu para juntar as fotos num ZIP neste aparelho. Baixe uma por uma, abaixo.");
    } finally {
      setZip(null);
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Minhas fotos do ClicouAí (link para baixar): ${link}`,
  )}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 rounded-xl bg-background/70 p-3 text-sm text-foreground">
        <MailCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          <strong>Guarde este link.</strong> Enviamos também para{" "}
          <strong className="break-all">{email}</strong>. Fechou a página? Use{" "}
          <a
            href="/recuperar-compras"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Recuperar minhas compras
          </a>
          .
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {arquivos.length > 1 && (
          <Button size="touch" onClick={() => void baixarZip()} disabled={zip !== null}>
            {zip ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <FolderDown aria-hidden="true" data-icon="inline-start" />
            )}
            {zip
              ? `Preparando ${zip.feitos} de ${arquivos.length}…`
              : `Baixar todas (ZIP, ${arquivos.length})`}
          </Button>
        )}
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-[#0b3d1f] hover:bg-[#1fbe5b]"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          Me enviar no WhatsApp
        </a>
        <Button variant="outline" size="touch" onClick={() => void copiar()}>
          {copiado ? (
            <Check aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Copy aria-hidden="true" data-icon="inline-start" />
          )}
          {copiado ? "Link copiado" : "Copiar link"}
        </Button>
      </div>
      {erroZip && (
        <p role="alert" className="text-sm text-destructive">
          {erroZip}
        </p>
      )}
    </div>
  );
}
