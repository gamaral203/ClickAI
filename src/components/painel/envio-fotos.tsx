"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  TriangleAlert,
  CheckCircle2,
  Copy,
  ImageUp,
  Loader2,
  RotateCw,
  XCircle,
} from "lucide-react";

import {
  confirmarEnvioAcao,
  enviarFotosAcao,
  iniciarEnvioAcao,
} from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";

const LIMITE_BYTES = 30 * 1024 * 1024;
const MAXIMO = 500;
/** Fotos por pedido de URLs ao servidor (o limite de iniciarEnvio). */
const POR_LOTE = 25;
/** Envios ao R2 ao mesmo tempo: mais que isso disputa a banda e não acelera. */
const PARALELOS = 3;
/** URL assinada vale 15 min; depois de 12, pede outra antes de começar o envio do arquivo. */
const URL_VALE_MS = 12 * 60 * 1000;

export type ModoEnvio = "r2" | "simulado" | "indisponivel";

type Estado =
  "recusada" | "repetida" | "aguardando" | "enviando" | "processando" | "pronta" | "erro";

type Item = {
  arquivo: File;
  /** SHA-256 do arquivo: a mesma foto tem o mesmo hash, mesmo com outro nome. */
  hash: string | null;
  estado: Estado;
  /** Motivo da recusa ou do erro. */
  problema: string | null;
  /** Bytes já enviados ao R2. */
  enviados: number;
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

async function conferir(arquivo: File): Promise<Item> {
  const item = { arquivo, hash: null, enviados: 0 };
  if (arquivo.type.startsWith("video/")) {
    return {
      ...item,
      estado: "recusada",
      problema: "O envio de vídeos ainda não está disponível.",
    };
  }
  if (arquivo.size > LIMITE_BYTES) {
    return { ...item, estado: "recusada", problema: "Maior que 30 MB." };
  }
  if (!/\.jpe?g$/i.test(arquivo.name) || !(await ehJpeg(arquivo))) {
    return {
      ...item,
      estado: "recusada",
      problema: "Não é JPEG. Exporte a foto em JPEG antes de enviar.",
    };
  }
  return { ...item, hash: await calcularHash(arquivo), estado: "aguardando", problema: null };
}

function tamanho(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

/** PUT do arquivo direto no R2, com o progresso em bytes. Resolve com o status HTTP (0 = rede). */
function enviarAoR2(url: string, arquivo: File, progresso: (bytes: number) => void) {
  return new Promise<number>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Tem de ser igual ao assinado no servidor; o tamanho o navegador manda sozinho.
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.upload.onprogress = (e) => progresso(e.loaded);
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.ontimeout = () => resolve(0);
    xhr.send(arquivo);
  });
}

const ENVIAVEL: Estado[] = ["aguardando", "erro"];

export function EnvioFotos({ eventoId, modo }: { eventoId: string; modo: ModoEnvio }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [conferindo, setConferindo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const indisponivel = modo === "indisponivel";

  function atualizar(indice: number, mudanca: Partial<Item>) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)));
  }

  async function selecionar(arquivos: FileList | null) {
    if (!arquivos?.length || enviando) return;
    setMensagem(null);
    setConferindo(true);
    const conferidos = await Promise.all([...arquivos].slice(0, MAXIMO).map(conferir));
    // A mesma foto escolhida duas vezes nesta seleção vai uma vez só.
    const vistos = new Set<string>();
    for (const c of conferidos) {
      if (!c.hash) continue;
      if (vistos.has(c.hash)) {
        c.estado = "repetida";
        c.problema = "Repetida nesta seleção.";
      }
      vistos.add(c.hash);
    }
    setItens(conferidos);
    setConferindo(false);
  }

  /** Envio real: URLs assinadas em lotes, PUT direto ao R2 e confirmação foto a foto. */
  async function enviarR2(indices: number[]) {
    const fila = [...indices];
    /** URL de cada índice e quando foi pedida. */
    const urls = new Map<number, { fotoId: string; url: string; em: number }>();
    let erroGeral: string | null = null;

    async function pedirUrls(lote: number[]) {
      const resultado = await iniciarEnvioAcao(
        eventoId,
        lote.map((i) => ({
          nome: itens[i].arquivo.name,
          tamanhoBytes: itens[i].arquivo.size,
          hash: itens[i].hash,
        })),
      ).catch(() => ({ erro: "A conexão caiu." }));
      if ("erro" in resultado) {
        erroGeral = resultado.erro;
        return false;
      }
      const agora = Date.now();
      resultado.itens.forEach((r, j) => {
        if ("repetida" in r) {
          atualizar(lote[j], { estado: "repetida", problema: "Já estava no evento." });
        } else {
          urls.set(lote[j], { ...r, em: agora });
        }
      });
      return true;
    }

    async function enviarUm(i: number) {
      const arquivo = itens[i].arquivo;
      let destino = urls.get(i);
      // URL velha (lote grande numa conexão lenta): pede outra para a mesma foto.
      if (destino && Date.now() - destino.em > URL_VALE_MS) {
        if (!(await pedirUrls([i]))) return;
        destino = urls.get(i);
      }
      if (!destino) return;
      atualizar(i, { estado: "enviando", problema: null, enviados: 0 });
      const status = await enviarAoR2(destino.url, arquivo, (bytes) =>
        atualizar(i, { enviados: bytes }),
      );
      if (status < 200 || status >= 300) {
        atualizar(i, {
          estado: "erro",
          enviados: 0,
          problema:
            status === 0 ? "A conexão caiu durante o envio." : "O armazenamento recusou o envio.",
        });
        return;
      }
      atualizar(i, { estado: "processando", enviados: arquivo.size });
      const resultado = await confirmarEnvioAcao(destino.fotoId).catch(() => ({
        erro: "A conexão caiu ao processar a foto.",
      }));
      atualizar(
        i,
        resultado.erro
          ? { estado: "erro", problema: resultado.erro }
          : { estado: "pronta", problema: null },
      );
    }

    for (let inicio = 0; inicio < fila.length && !erroGeral; inicio += POR_LOTE) {
      const lote = fila.slice(inicio, inicio + POR_LOTE);
      if (!(await pedirUrls(lote))) break;
      const comUrl = lote.filter((i) => urls.has(i));
      let proximo = 0;
      await Promise.all(
        Array.from({ length: Math.min(PARALELOS, comUrl.length) }, async () => {
          while (proximo < comUrl.length) await enviarUm(comUrl[proximo++]);
        }),
      );
    }
    return erroGeral;
  }

  /** Envio simulado (fora da produção, sem R2): cria itens com imagens de exemplo. */
  async function enviarSimulado(indices: number[]) {
    for (let inicio = 0; inicio < indices.length; inicio += POR_LOTE) {
      const lote = indices.slice(inicio, inicio + POR_LOTE);
      const resultado: { erro?: string } = await enviarFotosAcao(
        eventoId,
        lote.map((i) => ({
          nome: itens[i].arquivo.name,
          tamanhoBytes: itens[i].arquivo.size,
          ...(itens[i].hash && { hash: itens[i].hash }),
        })),
      ).catch(() => ({ erro: "A conexão caiu." }));
      if (resultado.erro) return resultado.erro;
      for (const i of lote) atualizar(i, { estado: "pronta", enviados: itens[i].arquivo.size });
    }
    return null;
  }

  async function enviar(indices: number[]) {
    if (indices.length === 0) return;
    setEnviando(true);
    setMensagem(null);
    const erro = modo === "r2" ? await enviarR2(indices) : await enviarSimulado(indices);
    setEnviando(false);
    if (erro) setMensagem({ tipo: "erro", texto: erro });
    router.refresh();
  }

  const paraEnviar = itens.flatMap((item, i) => (ENVIAVEL.includes(item.estado) ? [i] : []));
  const comErro = itens.flatMap((item, i) => (item.estado === "erro" ? [i] : []));
  const enviaveis = itens.filter((item) => item.estado !== "recusada" && item.hash);
  const prontas = itens.filter((item) => item.estado === "pronta").length;
  const repetidas = itens.filter((item) => item.estado === "repetida" && item.hash).length;
  const totalBytes = enviaveis.reduce((s, item) => s + item.arquivo.size, 0);
  const bytesEnviados = enviaveis.reduce(
    (s, item) =>
      s +
      (item.estado === "pronta" || item.estado === "processando" || item.estado === "repetida"
        ? item.arquivo.size
        : item.enviados),
    0,
  );
  const comecou = itens.some((item) => item.estado !== "aguardando" && item.estado !== "recusada");
  const porcento = totalBytes ? Math.round((bytesEnviados / totalBytes) * 100) : 0;
  const terminou = comecou && !enviando && paraEnviar.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {indisponivel ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            <strong>Armazenamento de fotos não configurado.</strong> O envio de fotos está
            temporariamente indisponível. Tente mais tarde ou fale com o suporte.
          </span>
        </p>
      ) : (
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
      )}

      {modo === "simulado" && (
        <p className="rounded-lg border border-dashed bg-highlight/20 p-3 text-sm">
          <strong>Ambiente de exemplo:</strong> o armazenamento de fotos (R2) não está configurado.
          Os arquivos são conferidos aqui, mas não sobem; cada foto aceita vira um item com uma
          imagem de exemplo.
        </p>
      )}

      {conferindo && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Conferindo as fotos…
        </p>
      )}

      {comecou && (
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
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {prontas} de {enviaveis.length - repetidas} prontas ({porcento}%)
            {repetidas > 0 && ` · ${repetidas} repetidas puladas`}
            {comErro.length > 0 && ` · ${comErro.length} com erro`}
          </p>
        </div>
      )}

      {itens.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {itens.map((item, i) => (
              <LinhaArquivo
                key={`${item.arquivo.name}-${i}`}
                item={item}
                podeTentar={!enviando && !indisponivel}
                tentarDeNovo={() => void enviar([i])}
              />
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {!comecou && (
              <Button
                size="touch"
                disabled={enviando || indisponivel || paraEnviar.length === 0}
                onClick={() => void enviar(paraEnviar)}
              >
                {paraEnviar.length === 0
                  ? "Nenhuma foto válida"
                  : `Enviar ${paraEnviar.length} ${paraEnviar.length === 1 ? "foto" : "fotos"}`}
              </Button>
            )}
            {enviando && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Enviando… mantenha esta página aberta.
              </p>
            )}
            {comecou && !enviando && paraEnviar.length > 0 && (
              <Button size="touch" variant="outline" onClick={() => void enviar(paraEnviar)}>
                <RotateCw aria-hidden="true" data-icon="inline-start" />
                Tentar de novo ({paraEnviar.length}{" "}
                {paraEnviar.length === 1 ? "restante" : "restantes"})
              </Button>
            )}
          </div>
        </div>
      )}

      {terminou && (
        <p role="status" className="text-sm text-primary">
          {prontas} {prontas === 1 ? "foto enviada" : "fotos enviadas"}.
          {repetidas > 0 &&
            ` ${repetidas} já ${repetidas === 1 ? "estava" : "estavam"} no evento ou na seleção e não ${repetidas === 1 ? "foi enviada" : "foram enviadas"} de novo.`}
        </p>
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

function LinhaArquivo({
  item,
  podeTentar,
  tentarDeNovo,
}: {
  item: Item;
  podeTentar: boolean;
  tentarDeNovo: () => void;
}) {
  const { arquivo, estado, problema } = item;
  const icone =
    estado === "repetida" ? (
      <Copy aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    ) : estado === "recusada" || estado === "erro" ? (
      <XCircle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
    ) : estado === "enviando" || estado === "processando" ? (
      <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-primary" />
    ) : (
      <CheckCircle2
        aria-hidden="true"
        className={
          estado === "pronta"
            ? "size-4 shrink-0 text-primary"
            : "size-4 shrink-0 text-muted-foreground"
        }
      />
    );
  const porcento = arquivo.size ? Math.round((item.enviados / arquivo.size) * 100) : 0;
  const situacao =
    estado === "enviando"
      ? `${porcento}%`
      : estado === "processando"
        ? "Processando…"
        : estado === "pronta"
          ? "Enviada"
          : null;

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2">
      <div className="flex items-center gap-3">
        {icone}
        <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
        <span className="text-muted-foreground tabular-nums">{tamanho(arquivo.size)}</span>
        {situacao && <span className="text-muted-foreground tabular-nums">{situacao}</span>}
        {estado === "erro" && podeTentar && (
          <Button size="sm" variant="outline" onClick={tentarDeNovo}>
            Tentar de novo
          </Button>
        )}
      </div>
      {estado === "enviando" && (
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full bg-primary" style={{ width: `${porcento}%` }} />
        </div>
      )}
      {problema && (
        <span className={estado === "repetida" ? "text-muted-foreground" : "text-destructive"}>
          {problema}
        </span>
      )}
    </li>
  );
}
