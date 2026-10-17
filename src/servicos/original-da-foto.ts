import "server-only";

import { registrarMetricaArmazenamento } from "@/dados/configuracoes";
import {
  type IntervaloDeBytes,
  medir,
  provedorDeOriginais,
  type ProvedorOriginal,
  type ReferenciaOriginal,
} from "@/lib/armazenamento";
import { ErroDrive } from "@/lib/google-drive";
import { dispositionDeAnexo, lerOriginal } from "@/lib/r2";

// Leitura e entrega do original pelo provedor certo (docs/arquitetura.md, "Armazenamento
// experimental"). No R2 nada muda: as mesmas funções de src/lib/r2.ts de sempre (leitura direta
// e URL assinada). No Google Drive (evento `hibrido`), o original é lido pelo provedor e entregue
// por streaming de uma rota do site, depois de a rota conferir o acesso: o navegador nunca
// recebe o id nem um link do Drive.

/** Onde está o original de uma foto (as colunas `chave_original`, `provedor_original` e `drive_arquivo_id`). */
export type OriginalDaFoto = {
  chave: string;
  provedorOriginal?: ProvedorOriginal | null;
  driveArquivoId?: string | null;
};

export function estaNoDrive(foto: OriginalDaFoto): boolean {
  return foto.provedorOriginal === "drive";
}

/** Referência do original no Drive (só para foto com `provedor_original = 'drive'`). */
export function referenciaNoDrive(foto: OriginalDaFoto): ReferenciaOriginal {
  return { provedor: "drive", chave: foto.chave, driveArquivoId: foto.driveArquivoId ?? null };
}

/**
 * O original inteiro na memória, de onde ele estiver. R2: `lerOriginal` de sempre. Drive: pelo
 * provedor, com a métrica `leitura_original`.
 */
export async function lerOriginalDaFoto(
  foto: OriginalDaFoto,
  extras: { fotoId?: string; eventoId?: string } = {},
): Promise<Buffer> {
  if (!estaNoDrive(foto)) return lerOriginal(foto.chave);
  const provedor = await provedorDeOriginais("drive");
  return medir("drive", "leitura_original", () => provedor.lerOriginal(referenciaNoDrive(foto)), {
    bytes: (b) => b.length,
    ...extras,
  });
}

/**
 * Apaga originais guardados no Drive (exclusão de evento sem pedidos). Melhor esforço, como no
 * R2: o que falhar fica só como arquivo órfão na pasta do Drive.
 */
export async function removerOriginaisDoDrive(
  originais: { chave: string; driveArquivoId: string }[],
): Promise<void> {
  if (originais.length === 0) return;
  let provedor;
  try {
    provedor = await provedorDeOriginais("drive");
  } catch (erro) {
    console.error(
      `[originais] Drive indisponível; ${originais.length} original(is) ficaram no Drive: ${erro instanceof Error ? erro.name : "erro"}`,
    );
    return;
  }
  await Promise.allSettled(
    originais.map((o) =>
      provedor.removerOriginal({
        provedor: "drive",
        chave: o.chave,
        driveArquivoId: o.driveArquivoId,
      }),
    ),
  );
}

/**
 * Lê o cabeçalho Range. Só um trecho `bytes=inicio-` ou `bytes=inicio-fim`; qualquer outra
 * forma (sufixo `bytes=-500`, vários trechos, lixo) é ignorada e o arquivo vai inteiro (200),
 * como o HTTP permite.
 */
export function intervaloDoCabecalho(valor: string | null): IntervaloDeBytes | undefined {
  if (!valor) return undefined;
  const partes = /^bytes=(\d{1,15})-(\d{0,15})$/.exec(valor.trim());
  if (!partes) return undefined;
  const inicio = Number(partes[1]);
  const fim = partes[2] ? Number(partes[2]) : undefined;
  if (fim !== undefined && fim < inicio) return undefined;
  return { inicio, fim };
}

function semCorpo(status: number, texto: string, extras: Record<string, string> = {}) {
  return new Response(texto, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      ...extras,
    },
  });
}

/** Resposta de quem já passou pela autorização, mas o Drive não respondeu (não é recusa). */
export function driveIndisponivel() {
  return semCorpo(503, "Download temporariamente indisponível. Tente de novo em alguns minutos.", {
    "Retry-After": "60",
  });
}

/**
 * Repassa o original do Drive como fluxo, para quem JÁ foi autorizado (pedido pago, ou o autor
 * com a liberação). Responde 200 ou 206 (com `Range`) com o tipo, o nome de anexo, o tamanho
 * quando o Drive informa, `Accept-Ranges` e sem cache; 416 para um trecho fora do arquivo. `null`
 * se o arquivo não existe (quem chama responde o 404 genérico de sempre).
 *
 * Métrica: a duração vai da abertura até o FIM do fluxo (último byte entregue, ou o navegador
 * desistir), com os bytes entregues; é gravada depois da resposta, por `depois` (o `after` da
 * rota), para não atrasar o último pedaço.
 */
export async function respostaDoOriginalEmFluxo(args: {
  foto: OriginalDaFoto;
  nomeArquivo: string;
  tipoMime: string;
  range: string | null;
  operacao: "download_original" | "leitura_original";
  depois: (tarefa: () => Promise<unknown>) => void;
  fotoId?: string;
  eventoId?: string;
}): Promise<Response | null> {
  const ref = referenciaNoDrive(args.foto);
  const inicio = performance.now();
  const registrar = (sucesso: boolean, bytes: number | null, erro?: unknown) =>
    registrarMetricaArmazenamento({
      provedor: "drive",
      operacao: args.operacao,
      duracaoMs: performance.now() - inicio,
      sucesso,
      bytes,
      erro,
      fotoId: args.fotoId,
      eventoId: args.eventoId,
    }).catch(() => {});

  let provedor;
  let fluxo;
  const intervalo = intervaloDoCabecalho(args.range);
  try {
    provedor = await provedorDeOriginais("drive");
    fluxo = await provedor.abrirFluxo(ref, intervalo);
  } catch (erro) {
    if (erro instanceof ErroDrive && erro.status === 416 && provedor) {
      const total = await provedor.tamanhoDoOriginal(ref).catch(() => null);
      return semCorpo(416, "Trecho fora do arquivo.", {
        "Accept-Ranges": "bytes",
        ...(total !== null ? { "Content-Range": `bytes */${total}` } : {}),
      });
    }
    args.depois(() => registrar(false, null, erro));
    // Só o nome do erro: nada de id do Drive, token ou URL no log.
    console.error(
      `[originais] falha ao abrir o original no Drive: ${erro instanceof ErroDrive ? erro.codigo : erro instanceof Error ? erro.name : "erro"}`,
    );
    return driveIndisponivel();
  }
  if (!fluxo) {
    args.depois(() => registrar(false, null, "Original não encontrado no Drive"));
    return null;
  }

  // O corpo passa adiante pedaço a pedaço (puxado pelo navegador, sem juntar na memória),
  // contando os bytes; o fim (ou a desistência) resolve `terminou` para a métrica.
  const leitor = fluxo.corpo.getReader();
  let entregues = 0;
  let avisar!: (fim: { sucesso: boolean; erro?: unknown }) => void;
  const terminou = new Promise<{ sucesso: boolean; erro?: unknown }>((r) => (avisar = r));
  const corpo = new ReadableStream<Uint8Array>({
    async pull(controle) {
      try {
        const { done, value } = await leitor.read();
        if (done) {
          controle.close();
          avisar({ sucesso: true });
          return;
        }
        entregues += value.byteLength;
        controle.enqueue(value);
      } catch (erro) {
        controle.error(erro);
        avisar({ sucesso: false, erro });
      }
    },
    async cancel(motivo) {
      await leitor.cancel(motivo).catch(() => {});
      avisar({ sucesso: false, erro: "Download interrompido pelo navegador" });
    },
  });
  args.depois(async () => {
    const fim = await terminou;
    await registrar(fim.sucesso, entregues, fim.erro);
  });

  const headers = new Headers({
    "Content-Type": args.tipoMime,
    "Content-Disposition": dispositionDeAnexo(args.nomeArquivo),
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (fluxo.tamanho !== null) headers.set("Content-Length", String(fluxo.tamanho));
  if (fluxo.status === 206 && fluxo.contentRange) headers.set("Content-Range", fluxo.contentRange);
  return new Response(corpo, { status: fluxo.status, headers });
}
