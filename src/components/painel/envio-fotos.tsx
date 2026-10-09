"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TriangleAlert, Camera, ImageUp, Loader2, RotateCw, XCircle } from "lucide-react";

import { enviarFotosAcao, iniciarEnvioAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";
import { emLotes, emParalelo, esperaDaTentativa } from "@/lib/concorrencia";
import { FOTOS_POR_LOTE, LIMITE_FOTO_BYTES } from "@/lib/limites-envio";

// Envio de fotos do evento (docs/arquitetura.md, "Upload"). Sem limite de quantidade: o
// fotógrafo escolhe quantas quiser (3.000 de uma vez) e o envio vai em três etapas que correm
// juntas, como uma linha de montagem:
//   1. lotes de FOTOS_POR_LOTE: calcula o SHA-256 e pede as URLs assinadas ao servidor;
//   2. ENVIOS_SIMULTANEOS arquivos subindo direto ao R2 (o arquivo nunca passa pelo Next);
//   3. PROCESSAMENTOS_SIMULTANEOS fotos sendo processadas no servidor (prévia com marca d'água,
//      miniatura, rostos) pela rota /api/envios/processar, enquanto as próximas sobem.
// Cada arquivo tem novas tentativas com espera crescente; um erro não para a fila. A tela não
// desenha uma linha por foto: mostra o progresso somado e só as fotos com problema.

/** Arquivos subindo ao R2 ao mesmo tempo. */
const ENVIOS_SIMULTANEOS = 6;
/** Fotos sendo processadas no servidor ao mesmo tempo (cada uma é uma função separada). */
const PROCESSAMENTOS_SIMULTANEOS = 4;
/** Arquivos lidos para o SHA-256 ao mesmo tempo (cada um ocupa a memória do arquivo inteiro). */
const HASHES_SIMULTANEOS = 4;
/** Tentativas de cada etapa (envio ao R2 e processamento) antes de desistir da foto. */
const TENTATIVAS = 4;
/** URL assinada vale 15 min; depois de 12, pede outra antes de começar o envio do arquivo. */
const URL_VALE_MS = 12 * 60 * 1000;
/** Fotos já com URL esperando para subir: a etapa 1 não corre muito à frente das outras. */
const FOLGA_DA_FILA = FOTOS_POR_LOTE * 2;
/** Fotos com problema listadas na tela (o resto aparece só na contagem). */
const PROBLEMAS_NA_TELA = 200;
/** Janela da velocidade média. */
const JANELA_VELOCIDADE_MS = 8000;

export type ModoEnvio = "r2" | "simulado" | "indisponivel";

type Estado =
  "recusada" | "repetida" | "aguardando" | "enviando" | "processando" | "pronta" | "erro";

type Item = {
  arquivo: File;
  /** SHA-256 do arquivo (calculado na hora de enviar): a mesma foto tem o mesmo hash. */
  hash: string | null;
  estado: Estado;
  /** Motivo da recusa ou do erro. */
  problema: string | null;
  /** Bytes já enviados ao R2. */
  enviados: number;
  /** Destino do envio (id da foto no servidor e URL assinada) e quando a URL foi pedida. */
  destino: { fotoId: string; url: string; em: number } | null;
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

/** Conferência rápida (sem ler o arquivo todo): tipo, tamanho e os primeiros bytes. */
async function conferir(arquivo: File): Promise<Item> {
  const item: Item = {
    arquivo,
    hash: null,
    enviados: 0,
    destino: null,
    estado: "aguardando",
    problema: null,
  };
  if (arquivo.type.startsWith("video/")) {
    return {
      ...item,
      estado: "recusada",
      problema: "O envio de vídeos ainda não está disponível.",
    };
  }
  if (arquivo.size > LIMITE_FOTO_BYTES) {
    return { ...item, estado: "recusada", problema: "Maior que 30 MB." };
  }
  if (!/\.jpe?g$/i.test(arquivo.name) || !(await ehJpeg(arquivo).catch(() => false))) {
    return {
      ...item,
      estado: "recusada",
      problema: "Não é JPEG. Exporte a foto em JPEG antes de enviar.",
    };
  }
  return item;
}

function tamanho(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
  }
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

function duracao(segundos: number) {
  if (segundos < 60) return "menos de 1 min";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `cerca de ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `cerca de ${horas} h ${String(minutos % 60).padStart(2, "0")} min`;
}

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

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

/** Pede ao servidor o processamento de uma foto que já está no R2. */
async function processar(fotoId: string): Promise<{ status: number; erro?: string }> {
  try {
    const resposta = await fetch("/api/envios/processar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotoId }),
    });
    const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
    return { status: resposta.status, erro: corpo.erro };
  } catch {
    return { status: 0 };
  }
}

/** Fila simples entre as etapas: quem consome espera até chegar item ou a fila fechar. */
class Fila {
  private itens: number[] = [];
  private esperando: ((valor: number | null) => void)[] = [];
  private fechada = false;
  private aoEsvaziar: (() => void)[] = [];

  get tamanho() {
    return this.itens.length;
  }

  colocar(valor: number) {
    const consumidor = this.esperando.shift();
    if (consumidor) consumidor(valor);
    else this.itens.push(valor);
  }

  proximo(): Promise<number | null> {
    if (this.itens.length > 0) {
      const valor = this.itens.shift()!;
      if (this.itens.length < FOLGA_DA_FILA) this.aoEsvaziar.splice(0).forEach((f) => f());
      return Promise.resolve(valor);
    }
    if (this.fechada) return Promise.resolve(null);
    return new Promise((ok) => this.esperando.push(ok));
  }

  /** Espera a fila baixar da folga (a etapa anterior não corre à frente). */
  async abaixoDaFolga() {
    while (this.itens.length >= FOLGA_DA_FILA) {
      await new Promise<void>((ok) => this.aoEsvaziar.push(ok));
    }
  }

  fechar() {
    this.fechada = true;
    this.esperando.splice(0).forEach((f) => f(null));
  }
}

const ENVIAVEL: Estado[] = ["aguardando", "erro"];

export function EnvioFotos({ eventoId, modo }: { eventoId: string; modo: ModoEnvio }) {
  const router = useRouter();
  /** Os itens ficam fora do estado do React: com milhares de fotos, cada progresso de envio
   *  copiaria a lista inteira. A tela redesenha em intervalos curtos (redesenhar). */
  const itens = useRef<Item[]>([]);
  /** Cópia da lista para a tela, renovada em intervalos curtos (redesenhar). */
  const [lista, setLista] = useState<Item[]>([]);
  const agendado = useRef(false);
  /** Amostras de bytes enviados no tempo, para a velocidade. */
  const amostras = useRef<{ em: number; bytes: number }[]>([]);
  const [velocidade, setVelocidade] = useState(0);
  const [conferindo, setConferindo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const indisponivel = modo === "indisponivel";

  function redesenhar() {
    if (agendado.current) return;
    agendado.current = true;
    setTimeout(() => {
      agendado.current = false;
      setLista([...itens.current]);
      // Velocidade média dos últimos segundos, pelos bytes já enviados.
      const agora = Date.now();
      const bytes = itens.current.reduce(
        (s, item) =>
          s +
          (item.estado === "processando" || item.estado === "pronta"
            ? item.arquivo.size
            : item.estado === "enviando"
              ? item.enviados
              : 0),
        0,
      );
      const serie = amostras.current;
      if (!serie.at(-1) || agora - serie.at(-1)!.em >= 500) serie.push({ em: agora, bytes });
      while (serie.length > 2 && agora - serie[0].em > JANELA_VELOCIDADE_MS) serie.shift();
      const [primeira, ultima] = [serie[0], serie.at(-1)!];
      setVelocidade(
        ultima.em - primeira.em >= 1000
          ? Math.max(0, ((ultima.bytes - primeira.bytes) * 1000) / (ultima.em - primeira.em))
          : 0,
      );
    }, 250);
  }

  function atualizar(indice: number, mudanca: Partial<Item>) {
    Object.assign(itens.current[indice], mudanca);
    redesenhar();
  }

  // Fechar a página no meio do envio para tudo: o navegador avisa antes.
  useEffect(() => {
    if (!enviando) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [enviando]);

  async function selecionar(arquivos: FileList | null) {
    if (!arquivos?.length || enviando) return;
    setMensagem(null);
    setConferindo(true);
    const lista = [...arquivos];
    const conferidos = await emParalelo(lista, 16, conferir);
    itens.current = conferidos.map((r, i) =>
      r.ok
        ? r.valor
        : {
            arquivo: lista[i],
            hash: null,
            enviados: 0,
            destino: null,
            estado: "recusada" as const,
            problema: "Não foi possível ler o arquivo.",
          },
    );
    amostras.current = [];
    setConferindo(false);
    redesenhar();
  }

  /** Calcula o SHA-256 das fotos do lote que ainda não têm e marca as repetidas na seleção. */
  async function calcularHashes(lote: number[]) {
    await emParalelo(lote, HASHES_SIMULTANEOS, async (i) => {
      const item = itens.current[i];
      if (item.hash) return;
      try {
        item.hash = await calcularHash(item.arquivo);
      } catch {
        atualizar(i, { estado: "erro", problema: "Não foi possível ler o arquivo." });
      }
    });
    // A mesma foto escolhida duas vezes vai uma vez só (a primeira ocorrência na seleção).
    const primeira = new Map<string, number>();
    itens.current.forEach((item, i) => {
      if (item.hash && !primeira.has(item.hash)) primeira.set(item.hash, i);
    });
    return lote.filter((i) => {
      const { hash, estado } = itens.current[i];
      if (!hash || estado !== "aguardando") return false;
      if (primeira.get(hash) !== i) {
        atualizar(i, { estado: "repetida", problema: "Repetida nesta seleção." });
        return false;
      }
      return true;
    });
  }

  /** Pede as URLs assinadas de um lote. Devolve a mensagem de erro geral, se houver. */
  async function pedirUrls(lote: number[]): Promise<string | null> {
    const resultado = await iniciarEnvioAcao(
      eventoId,
      lote.map((i) => ({
        nome: itens.current[i].arquivo.name,
        tamanhoBytes: itens.current[i].arquivo.size,
        hash: itens.current[i].hash,
      })),
    ).catch(() => ({ erro: "A conexão caiu. Tente de novo." }));
    if ("erro" in resultado) return resultado.erro;
    const agora = Date.now();
    resultado.itens.forEach((r, j) => {
      if ("repetida" in r) {
        atualizar(lote[j], { estado: "repetida", problema: "Já estava no evento." });
      } else {
        atualizar(lote[j], { destino: { ...r, em: agora } });
      }
    });
    return null;
  }

  /** Sobe um arquivo ao R2, com novas tentativas. `true` se chegou. */
  async function subir(i: number): Promise<boolean> {
    const item = itens.current[i];
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      // URL velha (fila longa numa conexão lenta) ou recusada pelo R2: pede outra para a foto.
      if (!item.destino || Date.now() - item.destino.em > URL_VALE_MS) {
        const erro = await pedirUrls([i]);
        if (erro) {
          atualizar(i, { estado: "erro", enviados: 0, problema: erro });
          return false;
        }
        if (item.estado === "repetida") return false;
      }
      if (!item.destino) break;
      atualizar(i, { estado: "enviando", problema: null, enviados: 0 });
      const status = await enviarAoR2(item.destino.url, item.arquivo, (bytes) => {
        item.enviados = bytes;
        redesenhar();
      });
      if (status >= 200 && status < 300) {
        atualizar(i, { estado: "processando", enviados: item.arquivo.size });
        return true;
      }
      atualizar(i, { estado: "aguardando", enviados: 0 });
      // 403: assinatura vencida ou recusada; a próxima volta pede uma URL nova.
      if (status === 403) item.destino = null;
      else if (status >= 400 && status < 500 && status !== 408 && status !== 429) break;
      if (tentativa < TENTATIVAS) await dormir(esperaDaTentativa(tentativa));
    }
    atualizar(i, {
      estado: "erro",
      enviados: 0,
      problema: "Não foi possível enviar o arquivo (conexão instável). Tente de novo.",
    });
    return false;
  }

  /** Processa no servidor uma foto que já subiu, com novas tentativas se a conexão falhar. */
  async function processarUma(i: number) {
    const fotoId = itens.current[i].destino?.fotoId;
    if (!fotoId) return;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      const { status, erro } = await processar(fotoId);
      if (status === 200) {
        atualizar(i, { estado: "pronta", problema: null });
        return;
      }
      // Recusa definitiva (arquivo inválido, foto de outro, sessão encerrada): não insiste.
      if (status === 401 || status === 403 || status === 422 || status === 400) {
        atualizar(i, {
          estado: "erro",
          destino: null,
          problema: erro ?? "Não foi possível processar a foto. Tente de novo.",
        });
        return;
      }
      if (tentativa < TENTATIVAS) await dormir(esperaDaTentativa(tentativa, 2000));
    }
    // A foto continua no servidor em `processando`: o job de revisão termina sozinho depois.
    atualizar(i, {
      estado: "erro",
      destino: null,
      problema:
        "O processamento não respondeu. Ela aparece no evento em até 1 hora, ou tente de novo.",
    });
  }

  /** Envio real: lotes de URLs, envios em paralelo ao R2 e processamento em paralelo. */
  async function enviarR2(indices: number[]) {
    const paraSubir = new Fila();
    const paraProcessar = new Fila();
    let erroGeral: string | null = null;
    let primeiroLote = true;

    const preparar = (async () => {
      for (const lote of emLotes(indices, FOTOS_POR_LOTE)) {
        if (erroGeral) break;
        await paraSubir.abaixoDaFolga();
        for (const i of lote) atualizar(i, { estado: "aguardando", destino: null, problema: null });
        const validos = await calcularHashes(lote);
        if (validos.length === 0) continue;
        const erro = await pedirUrls(validos);
        if (erro) {
          erroGeral = erro;
          break;
        }
        for (const i of validos) if (itens.current[i].destino) paraSubir.colocar(i);
        // As fotos já aparecem no painel como "processando".
        if (primeiroLote) router.refresh();
        primeiroLote = false;
      }
      paraSubir.fechar();
    })();

    const subidas = Array.from({ length: ENVIOS_SIMULTANEOS }, async () => {
      for (let i = await paraSubir.proximo(); i !== null; i = await paraSubir.proximo()) {
        if (await subir(i)) paraProcessar.colocar(i);
      }
    });

    const processamentos = Array.from({ length: PROCESSAMENTOS_SIMULTANEOS }, async () => {
      for (let i = await paraProcessar.proximo(); i !== null; i = await paraProcessar.proximo()) {
        await processarUma(i);
      }
    });

    await preparar;
    await Promise.all(subidas);
    paraProcessar.fechar();
    await Promise.all(processamentos);
    // O que não teve URL (lote interrompido) volta para a fila do "tentar de novo".
    for (const i of indices) {
      if (itens.current[i].estado === "aguardando" && erroGeral) {
        atualizar(i, { estado: "erro", problema: erroGeral });
      }
    }
    return erroGeral;
  }

  /** Envio simulado (fora da produção, sem R2): cria itens com imagens de exemplo. */
  async function enviarSimulado(indices: number[]) {
    for (const lote of emLotes(indices, FOTOS_POR_LOTE)) {
      for (const i of lote) atualizar(i, { estado: "aguardando", problema: null });
      const validos = await calcularHashes(lote);
      if (validos.length === 0) continue;
      const resultado: { erro?: string } = await enviarFotosAcao(
        eventoId,
        validos.map((i) => ({
          nome: itens.current[i].arquivo.name,
          tamanhoBytes: itens.current[i].arquivo.size,
          ...(itens.current[i].hash && { hash: itens.current[i].hash }),
        })),
      ).catch(() => ({ erro: "A conexão caiu." }));
      if (resultado.erro) return resultado.erro;
      for (const i of validos) {
        atualizar(i, { estado: "pronta", enviados: itens.current[i].arquivo.size });
      }
    }
    return null;
  }

  async function enviar(indices: number[]) {
    if (indices.length === 0) return;
    setEnviando(true);
    setMensagem(null);
    amostras.current = [];
    const erro = modo === "r2" ? await enviarR2(indices) : await enviarSimulado(indices);
    setEnviando(false);
    redesenhar();
    if (erro) setMensagem({ tipo: "erro", texto: erro });
    router.refresh();
  }

  // ------------------------------------------------------------ Resumo para a tela

  const paraEnviar: number[] = [];
  const problemas: number[] = [];
  let validas = 0;
  let recusadas = 0;
  let repetidas = 0;
  let subiram = 0;
  let prontas = 0;
  let comErro = 0;
  let totalBytes = 0;
  let bytesEnviados = 0;
  let comecou = false;
  lista.forEach((item, i) => {
    if (ENVIAVEL.includes(item.estado)) paraEnviar.push(i);
    if (item.estado === "recusada") {
      recusadas++;
      problemas.push(i);
      return;
    }
    if (item.estado !== "aguardando") comecou = true;
    if (item.estado === "repetida") {
      repetidas++;
      return;
    }
    validas++;
    totalBytes += item.arquivo.size;
    if (item.estado === "erro") {
      comErro++;
      problemas.push(i);
    }
    if (item.estado === "processando" || item.estado === "pronta") {
      subiram++;
      bytesEnviados += item.arquivo.size;
    } else if (item.estado === "enviando") {
      bytesEnviados += item.enviados;
    }
    if (item.estado === "pronta") prontas++;
  });

  // Tempo que falta para subir o resto, pela velocidade média dos últimos segundos.
  const restante = velocidade > 0 ? (totalBytes - bytesEnviados) / velocidade : null;

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
          <span className="font-medium">
            <span className="sm:hidden">Toque para escolher as fotos da galeria</span>
            <span className="hidden sm:inline">Arraste as fotos aqui ou clique para escolher</span>
          </span>
          <span className="text-sm text-muted-foreground">
            JPEG de até 30 MB cada, quantas quiser. Fotos repetidas são puladas sozinhas.
          </span>
          <input
            type="file"
            accept="image/jpeg"
            multiple
            className="sr-only"
            disabled={enviando}
            onChange={(e) => void selecionar(e.target.files)}
          />
        </label>
      )}

      {/* No celular: tirar a foto e já enviar, sem passar pela galeria. */}
      {!indisponivel && (
        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-medium has-disabled:opacity-50 sm:hidden">
          <Camera aria-hidden="true" className="size-4" />
          Tirar foto com a câmera
          <input
            type="file"
            accept="image/jpeg"
            capture="environment"
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

      {lista.length > 0 && !conferindo && (
        <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
          {!comecou ? (
            <p className="tabular-nums">
              <strong>
                {validas} {validas === 1 ? "foto pronta" : "fotos prontas"} para enviar
              </strong>{" "}
              ({tamanho(totalBytes)})
              {recusadas > 0 &&
                ` · ${recusadas} ${recusadas === 1 ? "recusada" : "recusadas"} (veja abaixo)`}
            </p>
          ) : (
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
              <p className="text-muted-foreground tabular-nums" aria-live="polite">
                <strong className="text-foreground">
                  {subiram} de {validas} enviadas
                </strong>{" "}
                ({porcento}%) · {prontas} {prontas === 1 ? "processada" : "processadas"}
                {comErro > 0 && ` · ${comErro} com erro`}
                {repetidas > 0 && ` · ${repetidas} repetidas puladas`}
              </p>
              <p className="text-muted-foreground tabular-nums">
                {tamanho(bytesEnviados)} de {tamanho(totalBytes)}
                {enviando && velocidade > 0 && ` · ${tamanho(velocidade)}/s`}
                {enviando &&
                  restante !== null &&
                  bytesEnviados < totalBytes &&
                  ` · ${duracao(restante)} para terminar de enviar`}
                {enviando &&
                  bytesEnviados >= totalBytes &&
                  subiram > prontas &&
                  ` · processando as últimas ${subiram - prontas}`}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
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
              <p role="status" className="flex items-center gap-2 text-muted-foreground">
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

          {problemas.length > 0 && (
            <ul className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-md border">
              {problemas.slice(0, PROBLEMAS_NA_TELA).map((i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-2">
                  <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{lista[i].arquivo.name}</span>
                    <span className="text-destructive">{lista[i].problema}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {tamanho(lista[i].arquivo.size)}
                  </span>
                </li>
              ))}
              {problemas.length > PROBLEMAS_NA_TELA && (
                <li className="px-3 py-2 text-muted-foreground">
                  E mais {problemas.length - PROBLEMAS_NA_TELA}.
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {terminou && (
        <p role="status" className="text-sm text-primary">
          {prontas} {prontas === 1 ? "foto enviada e processada" : "fotos enviadas e processadas"}.
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
