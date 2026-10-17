import "server-only";

// Onde ficam os originais (docs/arquitetura.md, "Armazenamento"). O R2 é o padrão; o Google
// Drive é um protótipo, só para eventos `hibrido` com a trava `armazenamento_experimental`
// ligada. Prévias e miniaturas continuam sempre no R2 público, e o upload do navegador continua
// indo para `envios/` no R2: o provedor só recebe o original já conferido pelo servidor.
//
// Regra: o navegador nunca recebe nada do Drive (nem link, nem id). No R2 o download é a URL
// assinada de 15 min de sempre; no Drive, a rota do site faz o streaming (`fluxo`) depois de
// conferir o pedido pago.

export type ProvedorOriginal = "r2" | "drive";

/**
 * Onde está o original de uma foto. `chave` é sempre a chave lógica
 * `originais/{fotografo}/{evento}/{foto}.{ext}` (dela saem extensão, tipo e nome); no Drive, o
 * arquivo é achado por `driveArquivoId`.
 */
export type ReferenciaOriginal = {
  provedor: ProvedorOriginal;
  chave: string;
  driveArquivoId?: string | null;
};

/** `url`: o navegador baixa direto (URL assinada do R2). `fluxo`: a rota do site faz o streaming. */
export type EntregaOriginal = { tipo: "url"; url: string } | { tipo: "fluxo" };

/** Trecho pedido num fluxo: bytes `inicio` até `fim`, INCLUSIVE (como no cabeçalho Range). */
export type IntervaloDeBytes = { inicio: number; fim?: number };

export type FluxoDoOriginal = {
  corpo: ReadableStream<Uint8Array>;
  /** Bytes deste corpo (o trecho, na resposta parcial), se o provedor informou. */
  tamanho: number | null;
  status: 200 | 206;
  /** `bytes inicio-fim/total`, na resposta parcial. */
  contentRange?: string;
};

export interface ProvedorDeOriginais {
  readonly nome: ProvedorOriginal;
  /** Grava o original (já conferido) e devolve onde ficou. Confere o tamanho gravado. */
  gravarOriginal(args: {
    chave: string;
    conteudo: Buffer;
    tipo: string;
    fotografoId: string;
    eventoId: string;
    fotoId: string;
  }): Promise<ReferenciaOriginal>;
  /** O original inteiro na memória (para processar a foto). */
  lerOriginal(ref: ReferenciaOriginal): Promise<Buffer>;
  /** Bytes `inicio` até `fim`, SEM incluir `fim` (como `lerTrecho` de src/lib/r2.ts). */
  lerTrecho(ref: ReferenciaOriginal, inicio: number, fim: number): Promise<Buffer>;
  /** Tamanho em bytes, ou `null` se o arquivo não existe. */
  tamanhoDoOriginal(ref: ReferenciaOriginal): Promise<number | null>;
  /** O original como fluxo, para a rota repassar; `null` se o arquivo não existe. */
  abrirFluxo(ref: ReferenciaOriginal, range?: IntervaloDeBytes): Promise<FluxoDoOriginal | null>;
  /** Apaga o original. Arquivo que já não existe não é erro. */
  removerOriginal(ref: ReferenciaOriginal): Promise<void>;
  /** Como entregar ao comprador (só depois de conferir o pedido pago). */
  entregaParaDownload(
    ref: ReferenciaOriginal,
    nomeArquivo: string,
    tipo: string,
  ): Promise<EntregaOriginal>;
}
