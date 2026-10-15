"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Download, ImageUp, Loader2, Scan, Trash2 } from "lucide-react";

import {
  confirmarMolduraAcao,
  iniciarMolduraAcao,
  removerMolduraAcao,
} from "@/app/(fotografo)/painel/eventos/moldura-acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  FORMATOS_MOLDURA,
  LIMITE_MOLDURA_BYTES,
  LIMITE_MOLDURA_TEXTO,
  MEDIDAS_MOLDURA,
  type FormatoMoldura,
} from "@/lib/moldura";

import type { ModoEnvio } from "./envio-fotos";

/** Foto de exemplo da prévia (imagem do próprio site, não é foto à venda). */
const FOTO_DE_EXEMPLO = "/inicio/corrida-rua.webp";

const PROPORCAO: Record<FormatoMoldura, string> = {
  story: "aspect-[9/16]",
  feed: "aspect-[4/5]",
};

/**
 * Moldura do evento (aba Design): uma arte em PNG com transparência para story e outra para feed.
 * Ferramenta de divulgação: na aba Fotos, o autor baixa uma foto dele já encaixada nela, para
 * anunciar o evento nas redes. O PNG vai direto do navegador ao R2 por URL assinada e o servidor confere (PNG, transparência, medidas) antes de valer. O colaborador
 * só vê (`somenteLeitura`).
 */
export function MolduraDoEvento({
  eventoId,
  molduras,
  modo,
  somenteLeitura = false,
}: {
  eventoId: string;
  /** Endereço de cada moldura (imagem de divulgação), ou `null` sem moldura. */
  molduras: Record<FormatoMoldura, string | null>;
  modo: ModoEnvio;
  somenteLeitura?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-semibold">
          <Scan aria-hidden="true" className="size-4 text-primary" />
          Moldura do evento
        </h3>
        <p className="text-sm text-muted-foreground">
          {somenteLeitura
            ? "A arte que o dono do evento enviou. Em Minhas fotos neste evento, baixe uma foto sua já com a moldura (Story ou Feed) para divulgar o evento. Só o dono envia ou troca a moldura."
            : "Envie a arte do evento (logo, patrocinadores, data) em PNG com transparência: a área transparente é onde a foto aparece. Na aba Fotos, baixe uma foto sua já com a moldura (Story ou Feed) para divulgar o evento nas redes. As prévias do site continuam sem moldura."}
        </p>
      </div>
      {modo === "indisponivel" && !somenteLeitura && (
        <p role="alert" className="text-sm text-destructive">
          Armazenamento de fotos não configurado: não dá para enviar a moldura agora.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {FORMATOS_MOLDURA.map((formato) => (
          <CartaoMoldura
            key={formato}
            eventoId={eventoId}
            formato={formato}
            url={molduras[formato]}
            modo={modo}
            somenteLeitura={somenteLeitura}
          />
        ))}
      </div>
    </div>
  );
}

/** Lê as medidas do PNG no aparelho (o servidor confere de novo). */
async function medidasDoArquivo(arquivo: File) {
  const bitmap = await createImageBitmap(arquivo);
  const medidas = { largura: bitmap.width, altura: bitmap.height };
  bitmap.close();
  return medidas;
}

function CartaoMoldura({
  eventoId,
  formato,
  url,
  modo,
  somenteLeitura,
}: {
  eventoId: string;
  formato: FormatoMoldura;
  url: string | null;
  modo: ModoEnvio;
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState<"enviando" | "removendo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { largura, altura, rotulo } = MEDIDAS_MOLDURA[formato];
  const medidas = `${largura}×${altura}`;
  const idErro = `moldura-${formato}-erro`;

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    try {
      if (arquivo.type !== "image/png") return setErro("A moldura precisa ser um arquivo PNG.");
      if (arquivo.size > LIMITE_MOLDURA_BYTES) {
        return setErro(`Envie um PNG de até ${LIMITE_MOLDURA_TEXTO}.`);
      }
      const lida = await medidasDoArquivo(arquivo).catch(() => null);
      if (!lida) return setErro("Não conseguimos ler este PNG.");
      if (lida.largura !== largura || lida.altura !== altura) {
        return setErro(
          `A moldura de ${rotulo.toLowerCase()} precisa ter ${medidas} pixels (esta tem ${lida.largura}×${lida.altura}).`,
        );
      }
      setOcupado("enviando");
      const resultado = modo === "r2" ? await enviarAoR2(arquivo) : await enviarSimulado(arquivo);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    } catch {
      setErro("Não foi possível enviar a moldura. Confira a conexão e tente de novo.");
    } finally {
      setOcupado(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  /** URL assinada, PUT direto no bucket e confirmação (o servidor lê e confere o PNG). */
  async function enviarAoR2(arquivo: File): Promise<{ erro?: string }> {
    const inicio = await iniciarMolduraAcao({
      eventoId,
      formato,
      tamanho: arquivo.size,
      tipo: arquivo.type,
    });
    if ("erro" in inicio) return { erro: inicio.erro };
    const envio = await fetch(inicio.url, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: arquivo,
    });
    if (!envio.ok) return { erro: "O envio não chegou ao armazenamento. Tente de novo." };
    const confirmacao = await confirmarMolduraAcao({ eventoId, formato, chave: inicio.chave });
    return confirmacao.ok ? {} : { erro: confirmacao.erro };
  }

  /** Sem R2 (desenvolvimento): o PNG vai à rota de envio simulado. */
  async function enviarSimulado(arquivo: File): Promise<{ erro?: string }> {
    const busca = new URLSearchParams({ evento: eventoId, formato });
    const resposta = await fetch(`/api/painel/molduras/simulado?${busca}`, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: arquivo,
    });
    // Moldura recusada na conferência também vem com 200, com o motivo em `erro`.
    const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
    if (resposta.ok) return corpo.erro ? { erro: corpo.erro } : {};
    return { erro: corpo.erro ?? "Não foi possível enviar a moldura." };
  }

  async function remover() {
    setErro(null);
    setOcupado("removendo");
    const resultado = await removerMolduraAcao({ eventoId, formato }).catch(() => ({
      ok: false as const,
      erro: "Não foi possível remover a moldura. Tente de novo.",
    }));
    setOcupado(null);
    if (resultado.ok) router.refresh();
    else setErro(resultado.erro);
  }

  return (
    <section
      aria-label={`Moldura para ${rotulo.toLowerCase()}`}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{rotulo}</h4>
        <span className="text-xs text-muted-foreground tabular-nums">{medidas} px</span>
      </div>
      <div
        className={`relative mx-auto w-full max-w-56 overflow-hidden rounded-lg bg-muted ${PROPORCAO[formato]}`}
      >
        <Image
          src={FOTO_DE_EXEMPLO}
          alt=""
          fill
          sizes="224px"
          className={url ? "object-cover" : "object-cover opacity-40"}
        />
        {url ? (
          <Image
            src={url}
            alt={`Moldura de ${rotulo.toLowerCase()} aplicada a uma foto de exemplo`}
            fill
            sizes="224px"
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center text-xs font-medium text-foreground">
            <Scan aria-hidden="true" className="size-6" />
            Sem moldura
          </span>
        )}
        {ocupado && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 aria-hidden="true" className="size-6 animate-spin" />
          </span>
        )}
      </div>
      {!somenteLeitura && (
        <div className="flex flex-col gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/png"
            className="sr-only"
            tabIndex={-1}
            aria-label={`Enviar moldura de ${rotulo.toLowerCase()} (PNG ${medidas})`}
            onChange={(e) => void enviar(e.target.files?.[0])}
          />
          <Button
            size="touch"
            disabled={ocupado !== null || modo === "indisponivel"}
            aria-describedby={erro ? idErro : undefined}
            onClick={() => entrada.current?.click()}
          >
            {ocupado === "enviando" ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <ImageUp aria-hidden="true" />
            )}
            {url ? "Trocar moldura" : "Enviar moldura"}
          </Button>
          {url && (
            <Button
              size="touch"
              variant="outline"
              disabled={ocupado !== null}
              onClick={() => void remover()}
            >
              {ocupado === "removendo" ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              Remover
            </Button>
          )}
          {/* <a> e não <Link>: a rota devolve o PNG como anexo. */}
          <a
            href={`/api/molduras/modelo/${formato}`}
            download={`modelo-moldura-${formato}.png`}
            className={buttonVariants({ variant: "ghost", size: "touch" })}
          >
            <Download aria-hidden="true" data-icon="inline-start" />
            Baixar modelo
          </a>
          <p className="text-xs text-muted-foreground">
            PNG {medidas}, até {LIMITE_MOLDURA_TEXTO}. No modelo, a janela transparente é a foto, o
            azul é a faixa sugerida para a arte e o tracejado limão é a área segura para textos e
            logos.
          </p>
          {erro && (
            <p id={idErro} role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
