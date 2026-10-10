// Motor do download dos originais pelo dono do evento, no navegador (o servidor só entrega lotes
// de URLs assinadas; src/servicos/originais-do-dono.ts). Os arquivos vêm direto do R2.
//
// Um arquivo por vez fica na memória (até 3 em paralelo): baixado inteiro como Blob, para poder
// repetir um arquivo que caiu no meio sem estragar a pasta ou o ZIP. Daí ele vai para:
//   - uma pasta escolhida pela pessoa (showDirectoryPicker, Chrome e Edge): grava e solta;
//   - um ZIP em streaming (client-zip) gravado direto no disco (showSaveFilePicker) ou, sem essa
//     API e até LIMITE_ZIP_NA_MEMORIA, montado no navegador e baixado no fim;
//   - em último caso, um link de download por arquivo, um de cada vez.
// URL perto de vencer (ou recusada pelo R2) é trocada por uma nova antes de tentar de novo.

export type ItemBaixar = {
  id: string;
  nome: string;
  url: string;
  bytes: number | null;
  excluida: boolean;
};

export type LoteBaixar =
  | { ok: true; itens: ItemBaixar[]; proximo: string | null; indisponiveis: string[] }
  | { ok: false; motivo: "nao_encontrado" | "liberacao" | "limite" | "invalido"; erro: string };

/** Pede ao servidor um lote: o seguinte ao cursor `depois`, ou só os `ids` (URLs novas). */
export type FonteDeLotes = (pedido: {
  depois?: string | null;
  ids?: string[];
}) => Promise<LoteBaixar>;

export type Progresso = {
  feitos: number;
  bytes: number;
  falhas: string[];
  atual: string | null;
};

/** Erro que para o download inteiro (liberação vencida, evento não encontrado, cancelado). */
export class DownloadInterrompido extends Error {
  constructor(
    readonly motivo: "liberacao" | "nao_encontrado" | "invalido" | "cancelado",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** URL assinada vale 15 min; com menos de 2 min de folga, pede outra antes de usar. */
export const VIDA_UTIL_URL_MS = 13 * 60 * 1000;
/** ZIP montado na memória (navegador sem showSaveFilePicker): só até este tamanho. */
export const LIMITE_ZIP_NA_MEMORIA = 1.5 * 1024 ** 3;
const PARALELOS = 3;
const TENTATIVAS = 3;
const ESPERA_LIMITE_MS = 60_000;

type ItemComHora = ItemBaixar & { obtidoEm: number };

function esperar(ms: number, sinal: AbortSignal) {
  return new Promise<void>((resolver, rejeitar) => {
    const id = setTimeout(resolver, ms);
    sinal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        rejeitar(new DownloadInterrompido("cancelado", "Cancelado."));
      },
      { once: true },
    );
  });
}

/** Chama a fonte; no limite de lotes, espera e tenta de novo; nos outros erros, interrompe. */
async function pedir(
  fonte: FonteDeLotes,
  pedido: Parameters<FonteDeLotes>[0],
  sinal: AbortSignal,
  aoEsperar?: (esperando: boolean) => void,
) {
  for (;;) {
    if (sinal.aborted) throw new DownloadInterrompido("cancelado", "Cancelado.");
    const lote = await fonte(pedido);
    if (lote.ok) return lote;
    if (lote.motivo === "limite") {
      aoEsperar?.(true);
      await esperar(ESPERA_LIMITE_MS, sinal);
      aoEsperar?.(false);
      continue;
    }
    throw new DownloadInterrompido(lote.motivo, lote.erro);
  }
}

/**
 * Todos os itens do modo, lote a lote (só pede o próximo lote quando precisa). Os ids em
 * `pular` (já baixados nesta sessão) não voltam.
 */
export async function* itensDosLotes(
  fonte: FonteDeLotes,
  sinal: AbortSignal,
  opcoes: { pular?: ReadonlySet<string>; ids?: string[]; aoEsperar?: (e: boolean) => void } = {},
): AsyncGenerator<ItemComHora> {
  const { pular, ids, aoEsperar } = opcoes;
  if (ids) {
    // Só alguns (repetir falhas): em pedaços do tamanho de um lote.
    for (let i = 0; i < ids.length; i += 50) {
      const lote = await pedir(fonte, { ids: ids.slice(i, i + 50) }, sinal, aoEsperar);
      const agora = Date.now();
      for (const item of lote.itens) if (!pular?.has(item.id)) yield { ...item, obtidoEm: agora };
    }
    return;
  }
  let depois: string | null = null;
  do {
    const lote = await pedir(fonte, { depois }, sinal, aoEsperar);
    const agora = Date.now();
    for (const item of lote.itens) if (!pular?.has(item.id)) yield { ...item, obtidoEm: agora };
    depois = lote.proximo;
  } while (depois);
}

/** URL nova para um item (venceu ou o R2 recusou). */
async function renovar(fonte: FonteDeLotes, item: ItemComHora, sinal: AbortSignal) {
  const lote = await pedir(fonte, { ids: [item.id] }, sinal);
  const novo = lote.itens[0];
  if (!novo) return null;
  return { ...novo, obtidoEm: Date.now() };
}

/** Baixa um arquivo inteiro, com repetição e URL nova quando precisa. `null` se falhou. */
export async function baixarUm(
  fonte: FonteDeLotes,
  item: ItemComHora,
  sinal: AbortSignal,
  aoReceber: (bytes: number) => void,
  buscar: typeof fetch = fetch,
): Promise<Blob | null> {
  let atual: ItemComHora | null = item;
  for (let tentativa = 1; tentativa <= TENTATIVAS && atual; tentativa++) {
    if (Date.now() - atual.obtidoEm > VIDA_UTIL_URL_MS) atual = await renovar(fonte, atual, sinal);
    if (!atual) return null;
    let recebidos = 0;
    try {
      const resposta = await buscar(atual.url, { signal: sinal, credentials: "same-origin" });
      // 403/400: assinatura vencida ou recusada; pede outra URL na próxima volta.
      if (resposta.status === 403 || resposta.status === 400) {
        atual = { ...atual, obtidoEm: 0 };
        continue;
      }
      if (!resposta.ok || !resposta.body) throw new Error(`HTTP ${resposta.status}`);
      const partes: Uint8Array[] = [];
      const leitor = resposta.body.getReader();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        partes.push(value);
        recebidos += value.byteLength;
        aoReceber(value.byteLength);
      }
      return new Blob(partes as BlobPart[], {
        type: resposta.headers.get("content-type") ?? "application/octet-stream",
      });
    } catch (erro) {
      // O que chegou deste arquivo sai da conta: ele vai ser baixado de novo do começo.
      if (recebidos) aoReceber(-recebidos);
      if (sinal.aborted) throw new DownloadInterrompido("cancelado", "Cancelado.");
      if (erro instanceof DownloadInterrompido) throw erro;
      await esperar(1000 * tentativa, sinal);
    }
  }
  return null;
}

/**
 * Baixa os itens com até 3 em paralelo e entrega na ordem, um Blob por vez, para o destino.
 * Falhas vão para `progresso.falhas` (para "Repetir as falhas").
 */
export async function* baixados(
  fonte: FonteDeLotes,
  itens: AsyncIterable<ItemComHora>,
  sinal: AbortSignal,
  aoMudar: (p: Progresso) => void,
  opcoes: {
    /** Item que não precisa baixar (já está na pasta): conta como feito. */
    pularSe?: (item: ItemBaixar) => Promise<boolean>;
    buscar?: typeof fetch;
  } = {},
): AsyncGenerator<{ item: ItemBaixar; arquivo: Blob }> {
  const { pularSe, buscar = fetch } = opcoes;
  const progresso: Progresso = { feitos: 0, bytes: 0, falhas: [], atual: null };
  const avisar = () => aoMudar({ ...progresso, falhas: [...progresso.falhas] });
  const fila: { item: ItemComHora; arquivo: Promise<Blob | null> }[] = [];
  const iterador = itens[Symbol.asyncIterator]();
  let acabou = false;

  const encher = async () => {
    while (!acabou && fila.length < PARALELOS) {
      const proximo = await iterador.next();
      if (proximo.done) {
        acabou = true;
        break;
      }
      const item = proximo.value;
      if (pularSe && (await pularSe(item))) {
        progresso.feitos++;
        progresso.bytes += item.bytes ?? 0;
        avisar();
        continue;
      }
      const arquivo = baixarUm(
        fonte,
        item,
        sinal,
        (n) => {
          progresso.bytes += n;
          avisar();
        },
        buscar,
      );
      // Evita "unhandled rejection" enquanto espera a vez; o erro é tratado ao consumir.
      arquivo.catch(() => {});
      fila.push({ item, arquivo });
    }
  };

  await encher();
  while (fila.length > 0) {
    const { item, arquivo } = fila.shift()!;
    progresso.atual = item.nome;
    avisar();
    const blob = await arquivo;
    await encher();
    if (!blob) {
      progresso.falhas.push(item.id);
      avisar();
      continue;
    }
    yield { item, arquivo: blob };
    progresso.feitos++;
    avisar();
  }
  progresso.atual = null;
  avisar();
}

/** Caminho do arquivo dentro da pasta ou do ZIP: excluídas numa subpasta. */
export function caminhoDoItem(item: Pick<ItemBaixar, "nome" | "excluida">) {
  return item.excluida ? `excluidas/${item.nome}` : item.nome;
}

// ---------------------------------------------------------------- APIs do navegador

type Gravavel = {
  write(dados: Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};
type ArquivoNoDisco = {
  getFile(): Promise<File>;
  createWritable(): Promise<Gravavel>;
};
export type PastaNoDisco = {
  name: string;
  getDirectoryHandle(nome: string, opcoes?: { create?: boolean }): Promise<PastaNoDisco>;
  getFileHandle(nome: string, opcoes?: { create?: boolean }): Promise<ArquivoNoDisco>;
};
type JanelaComArquivos = Window & {
  showDirectoryPicker?: (opcoes?: { mode?: "readwrite"; id?: string }) => Promise<PastaNoDisco>;
  showSaveFilePicker?: (opcoes?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
};

export function recursosDoNavegador() {
  if (typeof window === "undefined") return { pasta: false, salvarArquivo: false };
  const janela = window as JanelaComArquivos;
  return {
    pasta: typeof janela.showDirectoryPicker === "function",
    salvarArquivo: typeof janela.showSaveFilePicker === "function",
  };
}

export async function escolherPasta() {
  return (window as JanelaComArquivos).showDirectoryPicker!({ mode: "readwrite", id: "originais" });
}

export async function escolherArquivoZip(nome: string) {
  const alvo = await (window as JanelaComArquivos).showSaveFilePicker!({
    suggestedName: nome,
    types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
  });
  return alvo.createWritable();
}

/** Arquivo que já está na pasta com o tamanho esperado (para retomar sem baixar de novo). */
export async function jaEstaNaPasta(pasta: PastaNoDisco, item: ItemBaixar) {
  try {
    const destino = item.excluida ? await pasta.getDirectoryHandle("excluidas") : pasta;
    const arquivo = await (await destino.getFileHandle(item.nome)).getFile();
    return arquivo.size > 0 && (item.bytes === null || arquivo.size === item.bytes);
  } catch {
    return false;
  }
}

export async function gravarNaPasta(pasta: PastaNoDisco, item: ItemBaixar, arquivo: Blob) {
  const destino = item.excluida
    ? await pasta.getDirectoryHandle("excluidas", { create: true })
    : pasta;
  const gravavel = await (
    await destino.getFileHandle(item.nome, { create: true })
  ).createWritable();
  try {
    await gravavel.write(arquivo);
    await gravavel.close();
  } catch (erro) {
    await gravavel.abort().catch(() => {});
    throw erro;
  }
}

/** Dispara o download de uma URL como arquivo (link temporário). */
export function baixarPorLink(url: string, nome: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
}
