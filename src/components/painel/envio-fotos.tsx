"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, Copy, ImageUp, Loader2, RotateCw, XCircle } from "lucide-react";

import { enviarFotosAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";

const LIMITE_BYTES = 30 * 1024 * 1024;
const MAXIMO = 500;
/** Fotos por lote: se a internet cair, perde-se no máximo um lote, e o resto continua depois. */
const POR_LOTE = 25;

type Conferido = {
  arquivo: File;
  problema: string | null;
  /** SHA-256 do arquivo: a mesma foto tem o mesmo hash, mesmo com outro nome. */
  hash: string | null;
};

/** JPEG de verdade começa com FF D8 FF, não importa a extensão (docs/riscos.md, Upload). */
async function ehJpeg(arquivo: File) {
  const inicio = new Uint8Array(await arquivo.slice(0, 3).arrayBuffer());
  return inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff;
}

async function calcularHash(arquivo: File) {
  const resumo = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function conferir(arquivo: File): Promise<Conferido> {
  if (arquivo.type.startsWith("video/")) {
    return { arquivo, hash: null, problema: "O envio de vídeos chega com o processamento real." };
  }
  if (arquivo.size > LIMITE_BYTES) return { arquivo, hash: null, problema: "Maior que 30 MB." };
  if (!/\.jpe?g$/i.test(arquivo.name) || !(await ehJpeg(arquivo))) {
    return { arquivo, hash: null, problema: "Não é JPEG. Exporte a foto em JPEG antes de enviar." };
  }
  return { arquivo, hash: await calcularHash(arquivo), problema: null };
}

function tamanho(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

type Progresso = { enviadas: number; total: number; repetidas: number };

export function EnvioFotos({ eventoId }: { eventoId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [lista, setLista] = useState<Conferido[]>([]);
  const [conferindo, setConferindo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  /** O que ainda falta enviar depois de uma queda; o botão "Continuar" retoma daqui. */
  const [pendentes, setPendentes] = useState<Conferido[]>([]);

  async function selecionar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setMensagem(null);
    setPendentes([]);
    setProgresso(null);
    setConferindo(true);
    const conferidos = await Promise.all([...arquivos].slice(0, MAXIMO).map(conferir));
    // A mesma foto escolhida duas vezes nesta seleção vai uma vez só.
    const vistos = new Set<string>();
    for (const c of conferidos) {
      if (!c.hash) continue;
      if (vistos.has(c.hash)) c.problema = "Repetida nesta seleção.";
      vistos.add(c.hash);
    }
    setLista(conferidos);
    setConferindo(false);
  }

  const validos = lista.filter((c) => !c.problema);

  async function enviar(fila: Conferido[], inicial: Progresso) {
    setEnviando(true);
    setMensagem(null);
    let atual = inicial;
    setProgresso(atual);
    for (let i = 0; i < fila.length; i += POR_LOTE) {
      const lote = fila.slice(i, i + POR_LOTE);
      const resultado: { erro?: string; enviados?: number; repetidas?: number } =
        await enviarFotosAcao(
          eventoId,
          lote.map((c) => ({
            nome: c.arquivo.name,
            tamanhoBytes: c.arquivo.size,
            ...(c.hash && { hash: c.hash }),
          })),
        ).catch(() => ({ erro: "A conexão caiu." }));
      if (resultado.erro) {
        setPendentes(fila.slice(i));
        setMensagem({
          tipo: "erro",
          texto: `${resultado.erro} ${atual.enviadas} de ${atual.total} já foram. Toque em "Continuar envio" para mandar o resto.`,
        });
        setEnviando(false);
        router.refresh();
        return;
      }
      atual = {
        total: atual.total,
        enviadas: atual.enviadas + lote.length,
        repetidas: atual.repetidas + (resultado.repetidas ?? 0),
      };
      setProgresso(atual);
    }
    setPendentes([]);
    setLista([]);
    if (entrada.current) entrada.current.value = "";
    const novas = atual.enviadas - atual.repetidas;
    setMensagem({
      tipo: "ok",
      texto:
        `${novas} ${novas === 1 ? "foto enviada" : "fotos enviadas"}.` +
        (atual.repetidas
          ? ` ${atual.repetidas} já ${atual.repetidas === 1 ? "estava" : "estavam"} no evento e não ${atual.repetidas === 1 ? "foi enviada" : "foram enviadas"} de novo.`
          : ""),
    });
    setEnviando(false);
    router.refresh();
  }

  const porcento = progresso ? Math.round((progresso.enviadas / progresso.total) * 100) : 0;

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
          JPEG de até 30 MB, até {MAXIMO} por envio. Fotos repetidas são puladas sozinhas.
        </span>
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg"
          multiple
          className="sr-only"
          disabled={enviando}
          onChange={(e) => void selecionar(e.target.files)}
        />
      </label>

      <p className="rounded-lg border border-dashed bg-highlight/20 p-3 text-sm">
        <strong>Ambiente de exemplo:</strong> os arquivos são conferidos aqui, mas não sobem; cada
        foto aceita vira um item com uma imagem de exemplo. O envio real chega na Fase 12.
      </p>

      {conferindo && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Conferindo as fotos…
        </p>
      )}

      {progresso && (
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Progresso do envio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcento}
            className="h-3 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${porcento}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {progresso.enviadas} de {progresso.total} ({porcento}%)
            {progresso.repetidas > 0 && ` · ${progresso.repetidas} repetidas puladas`}
          </p>
        </div>
      )}

      {pendentes.length > 0 && !enviando && (
        <Button
          size="touch"
          className="w-fit"
          onClick={() =>
            void enviar(pendentes, {
              total: progresso?.total ?? pendentes.length,
              enviadas: (progresso?.total ?? pendentes.length) - pendentes.length,
              repetidas: progresso?.repetidas ?? 0,
            })
          }
        >
          <RotateCw aria-hidden="true" data-icon="inline-start" />
          Continuar envio ({pendentes.length} restantes)
        </Button>
      )}

      {lista.length > 0 && pendentes.length === 0 && (
        <div className="flex flex-col gap-3">
          <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {lista.map(({ arquivo, problema }, i) => (
              <li key={`${arquivo.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
                {problema === "Repetida nesta seleção." ? (
                  <Copy aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                ) : problema ? (
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
            onClick={() =>
              void enviar(validos, { enviadas: 0, total: validos.length, repetidas: 0 })
            }
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
