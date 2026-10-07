"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, ImageUp, Loader2, XCircle } from "lucide-react";

import { enviarFotosAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";

const LIMITE_BYTES = 30 * 1024 * 1024;
const MAXIMO = 500;

type Conferido = { arquivo: File; problema: string | null };

/** JPEG de verdade começa com FF D8 FF, não importa a extensão (docs/riscos.md, Upload). */
async function ehJpeg(arquivo: File) {
  const inicio = new Uint8Array(await arquivo.slice(0, 3).arrayBuffer());
  return inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff;
}

async function conferir(arquivo: File): Promise<Conferido> {
  if (arquivo.type.startsWith("video/")) {
    return { arquivo, problema: "O envio de vídeos chega com o processamento real." };
  }
  if (arquivo.size > LIMITE_BYTES) return { arquivo, problema: "Maior que 30 MB." };
  if (!/\.jpe?g$/i.test(arquivo.name) || !(await ehJpeg(arquivo))) {
    return { arquivo, problema: "Não é JPEG. Exporte a foto em JPEG antes de enviar." };
  }
  return { arquivo, problema: null };
}

function tamanho(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

export function EnvioFotos({ eventoId }: { eventoId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [lista, setLista] = useState<Conferido[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, startTransition] = useTransition();

  async function selecionar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setMensagem(null);
    setLista(await Promise.all([...arquivos].slice(0, MAXIMO).map(conferir)));
  }

  const validos = lista.filter((c) => !c.problema);

  function enviar() {
    startTransition(async () => {
      const resultado: { erro?: string; enviados?: number } = await enviarFotosAcao(
        eventoId,
        validos.map((c) => ({ nome: c.arquivo.name, tamanhoBytes: c.arquivo.size })),
      ).catch(() => ({ erro: "Não foi possível enviar. Verifique a conexão." }));
      if (resultado.erro) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      setMensagem({
        tipo: "ok",
        texto: `${resultado.enviados} ${resultado.enviados === 1 ? "foto enviada" : "fotos enviadas"}.`,
      });
      setLista([]);
      if (entrada.current) entrada.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void selecionar(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary data-[arrastando=true]:border-primary data-[arrastando=true]:bg-accent"
        data-arrastando={arrastando}
      >
        <ImageUp aria-hidden="true" className="size-8 text-primary" />
        <span className="font-medium">Arraste as fotos aqui ou clique para escolher</span>
        <span className="text-sm text-muted-foreground">
          JPEG de até 30 MB, até {MAXIMO} por envio.
        </span>
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg"
          multiple
          className="sr-only"
          onChange={(e) => void selecionar(e.target.files)}
        />
      </label>

      <p className="rounded-lg border border-dashed bg-highlight/20 p-3 text-sm">
        <strong>Ambiente de exemplo:</strong> os arquivos são conferidos aqui, mas não sobem; cada
        foto aceita vira um item com uma imagem de exemplo. O envio real chega na Fase 12.
      </p>

      {lista.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {lista.map(({ arquivo, problema }, i) => (
              <li key={`${arquivo.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
                {problema ? (
                  <XCircle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
                )}
                <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                <span className="text-muted-foreground tabular-nums">{tamanho(arquivo.size)}</span>
                {problema && <span className="text-destructive">{problema}</span>}
              </li>
            ))}
          </ul>
          <Button
            size="touch"
            className="w-fit"
            disabled={enviando || validos.length === 0}
            onClick={enviar}
          >
            {enviando && (
              <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            )}
            {validos.length === 0
              ? "Nenhuma foto válida"
              : `Enviar ${validos.length} ${validos.length === 1 ? "foto" : "fotos"}`}
          </Button>
        </div>
      )}

      {mensagem && (
        <p
          role={mensagem.tipo === "erro" ? "alert" : "status"}
          className={mensagem.tipo === "erro" ? "text-sm text-destructive" : "text-sm text-primary"}
        >
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
