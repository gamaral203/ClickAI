"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TriangleAlert, Camera, ImageUp, Loader2, RotateCw, XCircle } from "lucide-react";

import { enviarFotosAcao, iniciarEnvioAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";
import { emParalelo, esperaDaTentativa } from "@/lib/concorrencia";
import {
  AjusteDeConcorrencia,
  faixaDeConcorrencia,
  Vagas,
  type FaixaDeConcorrencia,
} from "@/lib/concorrencia-adaptativa";
import { impressaoDoBlob } from "@/lib/impressao-arquivo";
import { instanteDoCampo, type EscolhaLiberacao, type ModoLiberacao } from "@/lib/liberacao";
import {
  FOTOS_POR_LOTE,
  LIMITE_FOTO_BYTES,
  LIMITE_FOTO_TEXTO,
  quantasPartes,
  TAMANHO_PARTE,
} from "@/lib/limites-envio";
import {
  BYTES_PARA_DETECTAR,
  DADOS_DO_FORMATO,
  detectarFormato,
  MENSAGEM_FORMATO,
  MENSAGEM_RAW,
  type FormatoAceito,
} from "@/lib/tipos-imagem";

// Envio de fotos do evento (docs/arquitetura.md, "Upload"). Sem limite de quantidade: o
// fotógrafo escolhe quantas quiser (3.000 de uma vez) e o envio vai em três etapas que correm
// juntas, como uma linha de montagem:
//   1. lotes de FOTOS_POR_LOTE (o primeiro menor, para começar logo): converte HEIC para JPEG,
//      calcula a impressão de cada arquivo (src/lib/impressao-arquivo.ts, ~3 MB lidos por foto)
//      e pede as URLs assinadas ao servidor, à frente do envio;
//   2. envios direto ao R2 (o arquivo nunca passa pelo Next), com a quantidade ao mesmo tempo
//      ajustada pela vazão medida (src/lib/concorrencia-adaptativa.ts); arquivos grandes sobem
//      em partes, e uma parte que falha é reenviada sozinha;
//   3. PROCESSAMENTOS_SIMULTANEOS fotos sendo processadas no servidor (prévia com marca d'água,
//      miniatura, rostos) pela rota /api/envios/processar, enquanto as próximas sobem. Quando o
//      último upload termina, as fotos que ainda esperam processamento são entregues ao servidor
//      de uma vez ({ fotoIds }): ele as processa sozinho, e a página pode fechar. Se a página
//      fechar antes, as que já subiram vão por sendBeacon.
// Cada arquivo tem novas tentativas com espera crescente; um erro não para a fila. A tela não
// desenha uma linha por foto: mostra o progresso somado, só as fotos com problema e, em
// "Detalhes técnicos", os tempos médios de cada etapa (para medir o envio em produção).

/**
 * Fotos sendo processadas no servidor ao mesmo tempo (cada uma é uma função separada). O
 * processamento de cada foto é quase todo espera (R2, banco), não processador: com 6, o envio
 * terminava muito antes do processamento (~100 fotos por minuto contra ~300 enviadas).
 */
const PROCESSAMENTOS_SIMULTANEOS = 10;
/** Fotos por entrega ao servidor (o mesmo limite da rota /api/envios/processar). */
const FOTOS_POR_ENTREGA = 100;
/** Impressões calculadas ao mesmo tempo (cada uma lê só ~3 MB do arquivo). */
const IMPRESSOES_SIMULTANEAS = 8;
/** Partes de um mesmo arquivo grande subindo ao mesmo tempo (dentro das vagas gerais). */
const PARTES_SIMULTANEAS = 4;
/** Tentativas de cada etapa (envio ao R2 e processamento) antes de desistir da foto. */
const TENTATIVAS = 4;
/** Tentativas de cada parte de um arquivo grande, antes de desistir da rodada. */
const TENTATIVAS_PARTE = 5;
/** URL assinada vale 15 min; depois de 12, pede outra antes de começar o envio. */
const URL_VALE_MS = 12 * 60 * 1000;
/** O primeiro lote é pequeno: o envio começa sem esperar 50 impressões e 50 URLs. */
const PRIMEIRO_LOTE = 10;
/** Fotos já com URL esperando para subir: a etapa 1 não corre muito à frente das outras. */
const FOLGA_DA_FILA = FOTOS_POR_LOTE * 2;
/** Fotos com problema listadas na tela (o resto aparece só na contagem). */
const PROBLEMAS_NA_TELA = 200;
/** Janela da velocidade média. */
const JANELA_VELOCIDADE_MS = 8000;
/** Janela do ajuste de concorrência. */
const JANELA_AJUSTE_MS = 5000;
/** Qualidade do JPEG gerado a partir do HEIC (vira o original vendido). */
const QUALIDADE_HEIC = 0.95;

export type ModoEnvio = "r2" | "simulado" | "indisponivel";

type Estado =
  | "recusada"
  | "repetida"
  | "aguardando"
  | "enviando"
  | "processando"
  /** Já subiu e foi entregue ao servidor, que a processa sozinho (a página pode fechar). */
  | "no-servidor"
  | "pronta"
  | "erro";

type Partes = {
  uploadId: string;
  urls: string[];
  /** ETag de cada parte já enviada (null: falta enviar). */
  etags: (string | null)[];
};

type Item = {
  arquivo: File;
  /** Formato real, pelos primeiros bytes; HEIC vira JPEG antes do envio. */
  formato: FormatoAceito | "heic" | null;
  /** Veio de um HEIC convertido no navegador. */
  convertida: boolean;
  /** Impressão do arquivo (calculada na hora de enviar): a mesma foto tem a mesma impressão. */
  hash: string | null;
  estado: Estado;
  /** Motivo da recusa ou do erro. */
  problema: string | null;
  /** Bytes já enviados ao R2. */
  enviados: number;
  /** Destino do envio (id da foto no servidor e URL assinada ou partes) e quando foi pedido. */
  destino: { fotoId: string; url?: string; partes?: Partes; em: number } | null;
};

/** Somas para a telemetria ("Detalhes técnicos"). Só números: nada de nomes ou conteúdo. */
type Telemetria = {
  impressao: { n: number; ms: number };
  conversao: { n: number; ms: number };
  urls: { lotes: number; fotos: number; ms: number };
  envio: {
    n: number;
    bytes: number;
    ms: number;
    reenvios: number;
    partes: number;
    partesReenviadas: number;
  };
  processamento: { n: number; ms: number };
  servidor: { n: number } & Record<EtapaDoServidor, number>;
  concorrencia: { atual: number; faixa: FaixaDeConcorrencia | null; pico: number };
  vazaoMedia: number;
};

const ETAPAS_DO_SERVIDOR = [
  ["esperaMs", "espera de memória"],
  ["leituraMs", "leitura do R2"],
  ["conferenciaMs", "conferência"],
  ["versoesMs", "prévias"],
  ["gravacaoMs", "gravação"],
  ["rostosMs", "rostos"],
] as const;
type EtapaDoServidor = (typeof ETAPAS_DO_SERVIDOR)[number][0];

function telemetriaVazia(): Telemetria {
  return {
    impressao: { n: 0, ms: 0 },
    conversao: { n: 0, ms: 0 },
    urls: { lotes: 0, fotos: 0, ms: 0 },
    envio: { n: 0, bytes: 0, ms: 0, reenvios: 0, partes: 0, partesReenviadas: 0 },
    processamento: { n: 0, ms: 0 },
    servidor: {
      n: 0,
      esperaMs: 0,
      leituraMs: 0,
      conferenciaMs: 0,
      versoesMs: 0,
      gravacaoMs: 0,
      rostosMs: 0,
    },
    concorrencia: { atual: 0, faixa: null, pico: 0 },
    vazaoMedia: 0,
  };
}

const EXTENSOES_ACEITAS = ".jpg,.jpeg,.png,.webp,.tif,.tiff,.avif";
const TIPOS_ACEITOS = "image/jpeg,image/png,image/webp,image/tiff,image/avif";
const HEIC_ACEITO = ",image/heic,image/heif,.heic,.heif";

const semAssinatura = () => () => {};

/** iPhone e iPad convertem HEIC em JPEG sozinhos quando a página não pede HEIC. */
function ehIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Conferência rápida (sem ler o arquivo todo): tamanho e tipo real pelos primeiros bytes. */
async function conferir(arquivo: File): Promise<Item> {
  const item: Item = {
    arquivo,
    formato: null,
    convertida: false,
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
  const inicio = new Uint8Array(await arquivo.slice(0, BYTES_PARA_DETECTAR).arrayBuffer());
  const formato = detectarFormato(inicio, arquivo.name);
  if (formato === "raw") return { ...item, estado: "recusada", problema: MENSAGEM_RAW };
  if (!formato) return { ...item, estado: "recusada", problema: MENSAGEM_FORMATO };
  // O HEIC é conferido depois de convertido (o JPEG costuma ficar maior).
  if (formato !== "heic" && arquivo.size > LIMITE_FOTO_BYTES) {
    return {
      ...item,
      estado: "recusada",
      problema: `Maior que ${LIMITE_FOTO_TEXTO}. Exporte em JPEG ou com compressão e envie.`,
    };
  }
  return { ...item, formato };
}

/**
 * Converte um HEIC/HEIF em JPEG de alta qualidade, no navegador: o Sharp do servidor não lê HEVC
 * (patentes). Usa a heic-to (libheif compilada para JavaScript puro, sem eval nem WebAssembly,
 * compatível com a CSP do site), carregada só quando aparece um HEIC. A rotação já sai aplicada;
 * os metadados (EXIF, como a data de captura) não passam para o JPEG.
 */
async function heicParaJpeg(arquivo: File): Promise<File> {
  const { heicTo } = await import("heic-to/csp");
  const jpeg = await heicTo({ blob: arquivo, type: "image/jpeg", quality: QUALIDADE_HEIC });
  const nome = arquivo.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
  return new File([jpeg], nome, { type: "image/jpeg", lastModified: arquivo.lastModified });
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

/**
 * PUT direto no R2, com o progresso em bytes. Resolve com o status HTTP (0 = rede) e o ETag da
 * resposta (o R2 o expõe pelo CORS; o envio em partes precisa dele para fechar o upload).
 */
function putNoR2(
  url: string,
  corpo: Blob,
  tipo: string | null,
  progresso: (bytes: number) => void,
) {
  return new Promise<{ status: number; etag: string | null }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Tem de ser igual ao assinado no servidor; o tamanho o navegador manda sozinho. A parte de
    // um envio em partes vai sem tipo (é um Blob sem tipo).
    if (tipo) xhr.setRequestHeader("Content-Type", tipo);
    xhr.upload.onprogress = (e) => progresso(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, etag: xhr.getResponseHeader("ETag") });
    xhr.onerror = () => resolve({ status: 0, etag: null });
    xhr.ontimeout = () => resolve({ status: 0, etag: null });
    xhr.send(corpo);
  });
}

async function postJson<T>(url: string, corpo: object): Promise<{ status: number; dados: T }> {
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = (await resposta.json().catch(() => ({}))) as T;
    return { status: resposta.status, dados };
  } catch {
    return { status: 0, dados: {} as T };
  }
}

type RespostaDoProcessamento = {
  erro?: string;
  /** Outra chamada (entrega em segundo plano ou job) já estava processando, ou já está pronta. */
  emAndamento?: boolean;
  tempos?: Partial<Record<EtapaDoServidor, number>>;
};

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

  /** Tira da fila tudo o que ainda não foi pego. */
  retirarTodos() {
    return this.itens.splice(0);
  }
}

/** Lotes da seleção: o primeiro pequeno (o envio começa logo), os outros de FOTOS_POR_LOTE. */
function lotesDoEnvio(indices: number[]) {
  const lotes = [indices.slice(0, PRIMEIRO_LOTE)];
  for (let i = PRIMEIRO_LOTE; i < indices.length; i += FOTOS_POR_LOTE) {
    lotes.push(indices.slice(i, i + FOTOS_POR_LOTE));
  }
  return lotes.filter((l) => l.length > 0);
}

const ENVIAVEL: Estado[] = ["aguardando", "erro"];

/** Liberação dos próximos envios: o padrão do evento e se quem envia pode trocar (só o dono). */
export type LiberacaoDoEnvio = {
  modo: ModoLiberacao;
  /** Horário padrão da agendada, no formato do campo (Brasília), ou "". */
  em: string;
  podeEscolher: boolean;
  /** Ex.: "Agendada para 16:00 de 10/10", para quem não pode escolher. */
  descricao: string;
};

export function EnvioFotos({
  eventoId,
  modo,
  liberacao,
}: {
  eventoId: string;
  modo: ModoEnvio;
  liberacao?: LiberacaoDoEnvio;
}) {
  const router = useRouter();
  // Liberação deste lote: começa no padrão do evento; o dono pode trocar antes de enviar.
  const [modoLote, setModoLote] = useState<ModoLiberacao>(liberacao?.modo ?? "automatica");
  const [emLote, setEmLote] = useState(liberacao?.em ?? "");
  const [horarioPassado, setHorarioPassado] = useState(false);
  /** Escolha fixada no início do envio: o "tentar de novo" usa a mesma. */
  const escolhaDoEnvio = useRef<EscolhaLiberacao | null>(null);
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
  const telemetria = useRef<Telemetria>(telemetriaVazia());
  const [numeros, setNumeros] = useState<Telemetria>(telemetriaVazia());
  const [copiado, setCopiado] = useState(false);
  /** Tipos do seletor: sem HEIC no iPhone/iPad (o próprio sistema entrega o JPEG). */
  const ios = useSyncExternalStore(semAssinatura, ehIos, () => false);
  const aceita = TIPOS_ACEITOS + "," + EXTENSOES_ACEITAS + (ios ? "" : HEIC_ACEITO);

  const indisponivel = modo === "indisponivel";

  /** Bytes já enviados ao R2, somando os arquivos que já subiram e o progresso dos que sobem. */
  function bytesNoR2() {
    return itens.current.reduce(
      (s, item) =>
        s +
        (item.estado === "processando" || item.estado === "pronta" || item.estado === "no-servidor"
          ? item.arquivo.size
          : item.estado === "enviando"
            ? item.enviados
            : 0),
      0,
    );
  }

  function redesenhar() {
    if (agendado.current) return;
    agendado.current = true;
    setTimeout(() => {
      agendado.current = false;
      setLista([...itens.current]);
      // Velocidade média dos últimos segundos, pelos bytes já enviados.
      const agora = Date.now();
      const bytes = bytesNoR2();
      const serie = amostras.current;
      if (!serie.at(-1) || agora - serie.at(-1)!.em >= 500) serie.push({ em: agora, bytes });
      while (serie.length > 2 && agora - serie[0].em > JANELA_VELOCIDADE_MS) serie.shift();
      const [primeira, ultima] = [serie[0], serie.at(-1)!];
      setVelocidade(
        ultima.em - primeira.em >= 1000
          ? Math.max(0, ((ultima.bytes - primeira.bytes) * 1000) / (ultima.em - primeira.em))
          : 0,
      );
      setNumeros(structuredClone(telemetria.current));
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
            formato: null,
            convertida: false,
            hash: null,
            enviados: 0,
            destino: null,
            estado: "recusada" as const,
            problema: "Não foi possível ler o arquivo.",
          },
    );
    amostras.current = [];
    telemetria.current = telemetriaVazia();
    setConferindo(false);
    redesenhar();
  }

  /** Converte os HEIC do lote para JPEG (um por vez: a conversão é pesada). */
  async function converterHeics(lote: number[]) {
    for (const i of lote) {
      const item = itens.current[i];
      if (item.formato !== "heic") continue;
      const inicio = performance.now();
      try {
        const jpeg = await heicParaJpeg(item.arquivo);
        telemetria.current.conversao.n++;
        telemetria.current.conversao.ms += performance.now() - inicio;
        if (jpeg.size > LIMITE_FOTO_BYTES) {
          atualizar(i, { estado: "recusada", problema: `Maior que ${LIMITE_FOTO_TEXTO}.` });
          continue;
        }
        atualizar(i, { arquivo: jpeg, formato: "jpeg", convertida: true });
      } catch {
        atualizar(i, {
          estado: "erro",
          problema: "Não foi possível converter o HEIC. Exporte a foto em JPEG e envie.",
        });
      }
    }
  }

  /** Calcula a impressão das fotos do lote que ainda não têm e marca as repetidas na seleção. */
  async function calcularHashes(lote: number[]) {
    await emParalelo(lote, IMPRESSOES_SIMULTANEAS, async (i) => {
      const item = itens.current[i];
      if (item.hash || item.estado !== "aguardando") return;
      const inicio = performance.now();
      try {
        item.hash = await impressaoDoBlob(item.arquivo);
        telemetria.current.impressao.n++;
        telemetria.current.impressao.ms += performance.now() - inicio;
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
      const { hash, estado, formato } = itens.current[i];
      if (!hash || estado !== "aguardando" || !formato || formato === "heic") return false;
      if (primeira.get(hash) !== i) {
        atualizar(i, { estado: "repetida", problema: "Repetida nesta seleção." });
        return false;
      }
      return true;
    });
  }

  /** Pede as URLs assinadas de um lote. Devolve a mensagem de erro geral, se houver. */
  async function pedirUrls(lote: number[]): Promise<string | null> {
    const inicio = performance.now();
    const resultado = await iniciarEnvioAcao(
      eventoId,
      lote.map((i) => ({
        nome: itens.current[i].arquivo.name,
        tamanhoBytes: itens.current[i].arquivo.size,
        hash: itens.current[i].hash,
        formato: itens.current[i].formato,
      })),
      escolhaDoEnvio.current,
    ).catch(() => ({ erro: "A conexão caiu. Tente de novo." }));
    telemetria.current.urls.lotes++;
    telemetria.current.urls.fotos += lote.length;
    telemetria.current.urls.ms += performance.now() - inicio;
    if ("erro" in resultado) return resultado.erro;
    const agora = Date.now();
    resultado.itens.forEach((r, j) => {
      if ("repetida" in r) {
        atualizar(lote[j], { estado: "repetida", problema: "Já estava no evento." });
      } else if ("partes" in r) {
        const partes: Partes = {
          ...r.partes,
          etags: r.partes.urls.map(() => null),
        };
        atualizar(lote[j], { destino: { fotoId: r.fotoId, partes, em: agora } });
      } else {
        atualizar(lote[j], { destino: { fotoId: r.fotoId, url: r.url, em: agora } });
      }
    });
    return null;
  }

  /** Um PUT de cada vez por vaga; registra a duração e os bytes na telemetria. */
  async function comVaga<T>(vagas: Vagas, fazer: () => Promise<T>) {
    await vagas.pegar();
    const t = telemetria.current.concorrencia;
    t.pico = Math.max(t.pico, vagas.emUso);
    try {
      return await fazer();
    } finally {
      vagas.soltar();
    }
  }

  /** Sobe um arquivo pequeno num PUT só. Devolve o status HTTP (0 = rede). */
  async function subirInteiro(i: number, vagas: Vagas) {
    const item = itens.current[i];
    return comVaga(vagas, async () => {
      const destino = item.destino!;
      atualizar(i, { estado: "enviando", problema: null, enviados: 0 });
      const { status } = await putNoR2(
        destino.url!,
        item.arquivo,
        DADOS_DO_FORMATO[item.formato as FormatoAceito].mime,
        (bytes) => {
          item.enviados = bytes;
          redesenhar();
        },
      );
      return status;
    });
  }

  /**
   * Sobe um arquivo grande em partes, PARTES_SIMULTANEAS de cada vez dentro das vagas gerais.
   * Cada parte tem as próprias tentativas; as partes que já subiram ficam guardadas (uma nova
   * rodada só manda as que faltam). No fim, pede ao servidor para fechar o upload.
   * `reiniciar`: o upload não vale mais e precisa de um novo (outra URL).
   */
  async function subirEmPartes(i: number, vagas: Vagas): Promise<"ok" | "falhou" | "reiniciar"> {
    const item = itens.current[i];
    const destino = item.destino!;
    const partes = destino.partes!;
    const total = quantasPartes(item.arquivo.size);
    const progresso = partes.etags.map((e, n) =>
      e ? Math.min(TAMANHO_PARTE, item.arquivo.size - n * TAMANHO_PARTE) : 0,
    );
    const somar = () => {
      item.enviados = progresso.reduce((s, b) => s + b, 0);
      redesenhar();
    };
    atualizar(i, { estado: "enviando", problema: null });
    somar();

    let renovacao: Promise<boolean> | null = null;
    /** Assina de novo as partes que faltam (a URL venceu), uma renovação por vez. */
    const renovar = () =>
      (renovacao ??= (async () => {
        const numeros = partes.etags.flatMap((e, n) => (e ? [] : [n + 1]));
        const { status, dados } = await postJson<{ urls?: { numero: number; url: string }[] }>(
          "/api/envios/partes",
          { acao: "assinar", fotoId: destino.fotoId, uploadId: partes.uploadId, numeros },
        );
        if (status !== 200 || !dados.urls) return false;
        for (const { numero, url } of dados.urls) partes.urls[numero - 1] = url;
        destino.em = Date.now();
        return true;
      })().finally(() => (renovacao = null)));

    let resultado: "ok" | "falhou" | "reiniciar" = "ok";
    const pendentes = partes.etags.flatMap((e, n) => (e ? [] : [n + 1]));
    await emParalelo(pendentes, PARTES_SIMULTANEAS, async (numero) => {
      for (let tentativa = 1; tentativa <= TENTATIVAS_PARTE; tentativa++) {
        if (resultado !== "ok") return;
        const inicio = (numero - 1) * TAMANHO_PARTE;
        const pedaco = item.arquivo.slice(
          inicio,
          Math.min(item.arquivo.size, inicio + TAMANHO_PARTE),
        );
        const { status, etag } = await comVaga(vagas, async () => {
          if (Date.now() - destino.em > URL_VALE_MS && !(await renovar())) {
            return { status: -1, etag: null };
          }
          return putNoR2(partes.urls[numero - 1], pedaco, null, (bytes) => {
            progresso[numero - 1] = bytes;
            somar();
          });
        });
        if (status >= 200 && status < 300 && etag) {
          partes.etags[numero - 1] = etag;
          progresso[numero - 1] = pedaco.size;
          telemetria.current.envio.partes++;
          somar();
          return;
        }
        progresso[numero - 1] = 0;
        somar();
        if (status === -1) {
          resultado = "falhou";
          return;
        }
        telemetria.current.envio.partesReenviadas++;
        // 403: assinatura vencida ou recusada; 404: o upload não existe mais.
        if (status === 403) destino.em = 0;
        else if (status === 404) {
          resultado = "reiniciar";
          return;
        } else if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          resultado = "falhou";
          return;
        }
        if (tentativa < TENTATIVAS_PARTE) await dormir(esperaDaTentativa(tentativa));
      }
      if (resultado === "ok") resultado = "falhou";
    });
    if (resultado !== "ok") return resultado;
    if (partes.etags.slice(0, total).some((e) => !e)) return "falhou";

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      const { status } = await postJson("/api/envios/partes", {
        acao: "concluir",
        fotoId: destino.fotoId,
        uploadId: partes.uploadId,
        partes: partes.etags.map((etag, n) => ({ numero: n + 1, etag })),
      });
      if (status === 200) return "ok";
      if (status === 409) return "reiniciar";
      if (status !== 0 && status !== 503 && status !== 429 && status < 500) return "falhou";
      if (tentativa < TENTATIVAS) await dormir(esperaDaTentativa(tentativa));
    }
    return "falhou";
  }

  /** Sobe um arquivo ao R2 (inteiro ou em partes), com novas tentativas. `true` se chegou. */
  async function subir(i: number, vagas: Vagas): Promise<boolean> {
    const item = itens.current[i];
    const comeco = performance.now();
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      // Sem destino ou URL velha (fila longa numa conexão lenta): pede outra para a foto. No
      // envio em partes, a URL velha é renovada parte a parte, sem perder o que já subiu.
      const velha =
        item.destino && !item.destino.partes && Date.now() - item.destino.em > URL_VALE_MS;
      if (!item.destino || velha) {
        const erro = await pedirUrls([i]);
        if (erro) {
          atualizar(i, { estado: "erro", enviados: 0, problema: erro });
          return false;
        }
        if (item.estado === "repetida") return false;
      }
      if (!item.destino) break;

      let chegou = false;
      if (item.destino.partes) {
        const r = await subirEmPartes(i, vagas);
        chegou = r === "ok";
        if (r === "reiniciar") item.destino = null;
      } else {
        const status = await subirInteiro(i, vagas);
        chegou = status >= 200 && status < 300;
        // 403: assinatura vencida ou recusada; a próxima volta pede uma URL nova.
        if (status === 403) item.destino = null;
        else if (!chegou && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          break;
        }
      }
      if (chegou) {
        const t = telemetria.current.envio;
        t.n++;
        t.bytes += item.arquivo.size;
        t.ms += performance.now() - comeco;
        atualizar(i, { estado: "processando", enviados: item.arquivo.size });
        return true;
      }
      telemetria.current.envio.reenvios++;
      atualizar(i, { estado: "aguardando", enviados: 0 });
      if (tentativa < TENTATIVAS) await dormir(esperaDaTentativa(tentativa));
    }
    atualizar(i, {
      estado: "erro",
      enviados: 0,
      destino: null,
      problema: "Não foi possível enviar o arquivo (conexão instável). Tente de novo.",
    });
    return false;
  }

  /** Processa no servidor uma foto que já subiu, com novas tentativas se a conexão falhar. */
  async function processarUma(i: number) {
    const fotoId = itens.current[i].destino?.fotoId;
    if (!fotoId) return;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      const inicio = performance.now();
      const { status, dados } = await postJson<RespostaDoProcessamento>("/api/envios/processar", {
        fotoId,
      });
      if (status === 200 && dados.emAndamento) {
        atualizar(i, { estado: "pronta", problema: null });
        return;
      }
      if (status === 200) {
        const t = telemetria.current;
        t.processamento.n++;
        t.processamento.ms += performance.now() - inicio;
        if (dados.tempos) {
          t.servidor.n++;
          for (const [etapa] of ETAPAS_DO_SERVIDOR) t.servidor[etapa] += dados.tempos[etapa] ?? 0;
        }
        atualizar(i, { estado: "pronta", problema: null });
        return;
      }
      // Recusa definitiva (arquivo inválido, foto de outro, sessão encerrada): não insiste.
      if (status === 401 || status === 403 || status === 422 || status === 400) {
        atualizar(i, {
          estado: "erro",
          destino: null,
          problema: dados.erro ?? "Não foi possível processar a foto. Tente de novo.",
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
        "O processamento não respondeu. Ela aparece no evento em alguns minutos, ou tente de novo.",
    });
  }

  /**
   * Entrega ao servidor fotos que já subiram, para ele processar sozinho (a página pode fechar).
   * `beacon`: a página está fechando; vai por sendBeacon, sem esperar resposta. Devolve as que
   * não foram entregues (a rede falhou), para processar daqui.
   */
  async function entregarAoServidor(indices: number[], beacon = false): Promise<number[]> {
    const comId = indices.filter((i) => itens.current[i].destino?.fotoId);
    const falharam: number[] = [];
    for (let k = 0; k < comId.length; k += FOTOS_POR_ENTREGA) {
      const parte = comId.slice(k, k + FOTOS_POR_ENTREGA);
      const corpo = { fotoIds: parte.map((i) => itens.current[i].destino!.fotoId) };
      let entregou = false;
      if (beacon) {
        entregou = navigator.sendBeacon?.(
          "/api/envios/processar",
          new Blob([JSON.stringify(corpo)], { type: "application/json" }),
        );
      } else {
        for (let tentativa = 1; tentativa <= TENTATIVAS && !entregou; tentativa++) {
          const { status } = await postJson("/api/envios/processar", corpo);
          entregou = status === 202;
          if (!entregou && status >= 400 && status < 500) break;
          if (!entregou && tentativa < TENTATIVAS) await dormir(esperaDaTentativa(tentativa));
        }
      }
      if (entregou) for (const i of parte) atualizar(i, { estado: "no-servidor", problema: null });
      else falharam.push(...parte);
    }
    return falharam;
  }

  /** Envio real: lotes de URLs, envios em paralelo ao R2 e processamento em paralelo. */
  async function enviarR2(indices: number[]) {
    const paraSubir = new Fila();
    const paraProcessar = new Fila();
    let erroGeral: string | null = null;
    let primeiroLote = true;

    // Quantos envios ao mesmo tempo: começa pela faixa do tamanho médio e se ajusta à vazão.
    const tamanhoMedio =
      indices.reduce((s, i) => s + itens.current[i].arquivo.size, 0) / Math.max(1, indices.length);
    const faixa = faixaDeConcorrencia(tamanhoMedio);
    const ajuste = new AjusteDeConcorrencia(faixa);
    const vagas = new Vagas(ajuste.atual);
    telemetria.current.concorrencia = { atual: ajuste.atual, faixa, pico: 0 };
    let ultimaJanela = { em: Date.now(), bytes: bytesNoR2() };
    const inicioDoEnvio = { em: Date.now(), bytes: ultimaJanela.bytes };
    const relogio = setInterval(() => {
      const agora = { em: Date.now(), bytes: bytesNoR2() };
      const vazao = ((agora.bytes - ultimaJanela.bytes) * 1000) / (agora.em - ultimaJanela.em);
      ultimaJanela = agora;
      const saturado = vagas.esperando > 0 || paraSubir.tamanho > 0;
      vagas.definirLimite(ajuste.registrar(vazao, saturado));
      const t = telemetria.current;
      t.concorrencia.atual = ajuste.atual;
      t.vazaoMedia =
        ((agora.bytes - inicioDoEnvio.bytes) * 1000) / Math.max(1, agora.em - inicioDoEnvio.em);
      redesenhar();
    }, JANELA_AJUSTE_MS);

    const preparar = (async () => {
      for (const lote of lotesDoEnvio(indices)) {
        if (erroGeral) break;
        await paraSubir.abaixoDaFolga();
        for (const i of lote) atualizar(i, { estado: "aguardando", destino: null, problema: null });
        await converterHeics(lote);
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

    // Um trabalhador por envio possível; quem sobe de fato é limitado pelas vagas.
    const subidas = Array.from({ length: faixa.maximo }, async () => {
      for (let i = await paraSubir.proximo(); i !== null; i = await paraSubir.proximo()) {
        if (await subir(i, vagas)) paraProcessar.colocar(i);
      }
    });

    const processamentos = Array.from({ length: PROCESSAMENTOS_SIMULTANEOS }, async () => {
      for (let i = await paraProcessar.proximo(); i !== null; i = await paraProcessar.proximo()) {
        await processarUma(i);
      }
    });

    // Página fechando no meio: as fotos que já subiram e esperam processamento vão para o
    // servidor (sem isto, ficavam paradas até o job de revisão).
    const aoSair = () => void entregarAoServidor(paraProcessar.retirarTodos(), true);
    window.addEventListener("pagehide", aoSair);

    let naoEntregues: number[] = [];
    try {
      await preparar;
      await Promise.all(subidas);
      // Todos os uploads terminaram: o que ainda espera processamento vai para o servidor de uma
      // vez, em vez de a tela processar de 10 em 10 com a página aberta.
      naoEntregues = await entregarAoServidor(paraProcessar.retirarTodos());
    } finally {
      clearInterval(relogio);
      window.removeEventListener("pagehide", aoSair);
    }
    paraProcessar.fechar();
    await Promise.all(processamentos);
    await emParalelo(naoEntregues, PROCESSAMENTOS_SIMULTANEOS, processarUma);
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
    for (const lote of lotesDoEnvio(indices)) {
      for (const i of lote) atualizar(i, { estado: "aguardando", problema: null });
      await converterHeics(lote);
      const validos = await calcularHashes(lote);
      if (validos.length === 0) continue;
      const resultado: { erro?: string } = await enviarFotosAcao(
        eventoId,
        validos.map((i) => ({
          nome: itens.current[i].arquivo.name,
          tamanhoBytes: itens.current[i].arquivo.size,
          formato: itens.current[i].formato,
          ...(itens.current[i].hash && { hash: itens.current[i].hash }),
        })),
        escolhaDoEnvio.current,
      ).catch(() => ({ erro: "A conexão caiu." }));
      if (resultado.erro) return resultado.erro;
      for (const i of validos) {
        atualizar(i, { estado: "pronta", enviados: itens.current[i].arquivo.size });
      }
    }
    return null;
  }

  /** Começa o envio com a liberação escolhida; agendada no passado não começa. */
  function comecar(indices: number[]) {
    setHorarioPassado(false);
    if (liberacao?.podeEscolher) {
      if (modoLote === "agendada") {
        const em = instanteDoCampo(emLote);
        if (!em || em.getTime() <= Date.now()) {
          setHorarioPassado(true);
          return;
        }
        escolhaDoEnvio.current = { modo: "agendada", em: emLote };
      } else {
        escolhaDoEnvio.current = { modo: modoLote };
      }
    } else {
      escolhaDoEnvio.current = null;
    }
    void enviar(indices);
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
  let noServidor = 0;
  let comErro = 0;
  let heics = 0;
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
    if (item.formato === "heic" || item.convertida) heics++;
    totalBytes += item.arquivo.size;
    if (item.estado === "erro") {
      comErro++;
      problemas.push(i);
    }
    if (
      item.estado === "processando" ||
      item.estado === "pronta" ||
      item.estado === "no-servidor"
    ) {
      subiram++;
      bytesEnviados += item.arquivo.size;
    } else if (item.estado === "enviando") {
      bytesEnviados += item.enviados;
    }
    if (item.estado === "pronta") prontas++;
    if (item.estado === "no-servidor") noServidor++;
  });

  // Tempo que falta para subir o resto, pela velocidade média dos últimos segundos.
  const restante = velocidade > 0 ? (totalBytes - bytesEnviados) / velocidade : null;

  const porcento = totalBytes ? Math.round((bytesEnviados / totalBytes) * 100) : 0;
  const terminou = comecou && !enviando && paraEnviar.length === 0;
  const detalhes = textoDosDetalhes(numeros);

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
            JPEG, PNG, WebP, TIFF, AVIF ou HEIC, de qualquer tamanho até {LIMITE_FOTO_TEXTO},
            quantas quiser. RAW não: exporte antes. Fotos repetidas são puladas sozinhas.
          </span>
          <input
            type="file"
            accept={aceita}
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
                  subiram > prontas + noServidor &&
                  ` · processando as últimas ${subiram - prontas - noServidor}`}
              </p>
              {noServidor > 0 && (
                <p className="text-muted-foreground tabular-nums">
                  {noServidor}{" "}
                  {noServidor === 1
                    ? "foto está sendo processada no servidor"
                    : "fotos estão sendo processadas no servidor"}
                  : elas aparecem no evento em instantes, mesmo que você feche esta página.
                </p>
              )}
            </div>
          )}

          {heics > 0 && (
            <p className="text-muted-foreground">
              {heics} {heics === 1 ? "foto HEIC é convertida" : "fotos HEIC são convertidas"} para
              JPEG de alta qualidade aqui no navegador antes do envio, e o JPEG é o original
              vendido. A data de captura do HEIC não passa para o JPEG.
            </p>
          )}

          {!comecou && liberacao && (
            <EscolhaDaLiberacao
              eventoId={eventoId}
              liberacao={liberacao}
              modo={modoLote}
              em={emLote}
              aoMudarModo={(m) => {
                setModoLote(m);
                setHorarioPassado(false);
              }}
              aoMudarEm={(v) => {
                setEmLote(v);
                setHorarioPassado(false);
              }}
              horarioPassado={horarioPassado}
              aoLiberarAgora={() => {
                setModoLote("automatica");
                setHorarioPassado(false);
              }}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!comecou && (
              <Button
                size="touch"
                disabled={enviando || indisponivel || paraEnviar.length === 0}
                onClick={() => comecar(paraEnviar)}
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

          {comecou && detalhes.length > 0 && (
            <details className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-muted-foreground">Detalhes técnicos</summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
                {detalhes.map((linha) => (
                  <li key={linha}>{linha}</li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(detalhes.join("\n"))
                    .then(() => setCopiado(true))
                    .catch(() => {});
                }}
              >
                {copiado ? "Copiado" : "Copiar números"}
              </Button>
            </details>
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

const OPCOES_LIBERACAO: { valor: ModoLiberacao; rotulo: string; ajuda: string }[] = [
  { valor: "automatica", rotulo: "Automática", ajuda: "cada foto aparece assim que fica pronta" },
  { valor: "manual", rotulo: "Manual", ajuda: "ficam guardadas até você clicar em Liberar agora" },
  { valor: "agendada", rotulo: "Agendada", ajuda: "aparecem sozinhas na data e hora escolhidas" },
];

/** Quando as fotos deste envio aparecem. O colaborador só vê o padrão do dono. */
function EscolhaDaLiberacao({
  eventoId,
  liberacao,
  modo,
  em,
  aoMudarModo,
  aoMudarEm,
  horarioPassado,
  aoLiberarAgora,
}: {
  eventoId: string;
  liberacao: LiberacaoDoEnvio;
  modo: ModoLiberacao;
  em: string;
  aoMudarModo: (m: ModoLiberacao) => void;
  aoMudarEm: (v: string) => void;
  horarioPassado: boolean;
  aoLiberarAgora: () => void;
}) {
  if (!liberacao.podeEscolher) {
    return (
      <p className="text-muted-foreground">
        <strong className="text-foreground">Quando aparecem:</strong> {liberacao.descricao}. Quem
        decide é o dono do evento.
      </p>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">Quando estas fotos aparecem para o público</legend>
      <div className="flex flex-col gap-1">
        {OPCOES_LIBERACAO.map((o) => (
          <label key={o.valor} className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={`liberacao-${eventoId}`}
              value={o.valor}
              checked={modo === o.valor}
              onChange={() => aoMudarModo(o.valor)}
              className="size-5 accent-primary"
            />
            <span>
              <strong>{o.rotulo}:</strong> {o.ajuda}
              {o.valor === liberacao.modo && (
                <span className="text-muted-foreground"> (padrão do evento)</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {modo === "agendada" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`liberar-lote-${eventoId}`} className="font-medium">
            Liberar em (horário de Brasília)
          </label>
          <input
            id={`liberar-lote-${eventoId}`}
            type="datetime-local"
            value={em}
            onChange={(e) => aoMudarEm(e.target.value)}
            aria-invalid={horarioPassado}
            className="h-11 w-full max-w-xs rounded-md border border-input bg-transparent px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      )}
      {horarioPassado && (
        <div
          role="alert"
          className="flex flex-col gap-2 text-destructive sm:flex-row sm:items-center"
        >
          <span>
            {em ? "Esse horário já passou." : "Escolha a data e a hora."} Escolha um horário no
            futuro ou libere as fotos assim que ficarem prontas.
          </span>
          <Button size="sm" variant="outline" onClick={aoLiberarAgora}>
            Liberar ao ficarem prontas
          </Button>
        </div>
      )}
    </fieldset>
  );
}

const ms = (total: number, n: number) => `${Math.round(total / Math.max(1, n))} ms`;
const s = (total: number, n: number) =>
  `${(total / Math.max(1, n) / 1000).toFixed(1).replace(".", ",")} s`;
const mbs = (bytes: number, msTotal: number) =>
  `${(bytes / 1024 / 1024 / Math.max(0.001, msTotal / 1000)).toFixed(1).replace(".", ",")} MB/s`;

/**
 * Linhas dos "Detalhes técnicos": médias por foto de cada etapa, só números (nada de nomes de
 * arquivo nem dados pessoais), para o fotógrafo ou o gestor mandarem ao suporte.
 */
function textoDosDetalhes(t: Telemetria): string[] {
  const linhas: string[] = [];
  if (t.conversao.n) {
    linhas.push(
      `Conversão HEIC→JPEG: ${s(t.conversao.ms, t.conversao.n)} por foto (${t.conversao.n})`,
    );
  }
  if (t.impressao.n) {
    linhas.push(
      `Impressão (detectar repetidas): ${ms(t.impressao.ms, t.impressao.n)} por foto (${t.impressao.n})`,
    );
  }
  if (t.urls.lotes) {
    linhas.push(
      `URLs assinadas: ${ms(t.urls.ms, t.urls.lotes)} por pedido, ${ms(t.urls.ms, t.urls.fotos)} por foto (${t.urls.lotes} pedidos)`,
    );
  }
  if (t.envio.n) {
    linhas.push(
      `Envio ao R2: ${s(t.envio.ms, t.envio.n)} por foto, ${mbs(t.envio.bytes, t.envio.ms)} por arquivo, ${(t.vazaoMedia / 1024 / 1024).toFixed(1).replace(".", ",")} MB/s no total (${t.envio.n} fotos)`,
    );
  }
  if (t.concorrencia.faixa) {
    const f = t.concorrencia.faixa;
    linhas.push(
      `Envios simultâneos: ${t.concorrencia.atual} agora (faixa ${f.minimo}-${f.maximo}, pico ${t.concorrencia.pico})`,
    );
  }
  if (t.envio.reenvios || t.envio.partes) {
    linhas.push(
      `Reenvios: ${t.envio.reenvios} arquivos; partes de arquivos grandes: ${t.envio.partes} enviadas, ${t.envio.partesReenviadas} reenviadas`,
    );
  }
  if (t.processamento.n) {
    linhas.push(
      `Processamento: ${s(t.processamento.ms, t.processamento.n)} por foto, ida e volta (${t.processamento.n})`,
    );
  }
  if (t.servidor.n) {
    linhas.push(
      "No servidor, por foto: " +
        ETAPAS_DO_SERVIDOR.map(
          ([etapa, nome]) => `${nome} ${ms(t.servidor[etapa], t.servidor.n)}`,
        ).join(", "),
    );
  }
  return linhas;
}
