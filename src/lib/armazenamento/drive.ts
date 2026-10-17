import "server-only";

import {
  definirPastaRaizDrive,
  esquecerPastaDrive,
  esquecerPastaRaizDrive,
  gravarPastaDrive,
  PASTA_RAIZ_DRIVE,
  pastaDrive,
} from "@/dados/configuracoes";
import { type ClienteDrive, ErroDrive } from "@/lib/google-drive";

import type { IntervaloDeBytes, ProvedorDeOriginais, ReferenciaOriginal } from "./tipos";

// Adaptador do Google Drive (protótipo). Os originais ficam em
// `ClicouAI_Storage/{fotografo_id}/{evento_id}/{foto_id}.{ext}`; os ids das pastas ficam no
// cache `pastas_drive` (a pasta que falta é achada ou criada com `garantirPasta`). O arquivo no
// Drive nunca é compartilhado nem tem link entregue ao navegador: a entrega é sempre `fluxo`.

/** Chave lógica do original: `originais/{fotografo}/{evento}/{foto}.{ext}`. */
const CHAVE_DO_ORIGINAL = /^originais\/[^/]+\/[^/]+\/([^/]+)\.([a-z0-9]{1,5})$/i;

/** Nome do arquivo no Drive: `{fotoId}.{ext}`, com a extensão tirada da chave lógica. */
export function nomeNoDrive(chave: string, fotoId: string): string {
  const partes = CHAVE_DO_ORIGINAL.exec(chave);
  if (!partes) throw new Error("Chave fora dos originais");
  if (partes[1] !== fotoId) throw new Error("A chave não é desta foto");
  return `${fotoId}.${partes[2].toLowerCase()}`;
}

function idNoDrive(ref: ReferenciaOriginal): string {
  if (ref.provedor !== "drive") throw new Error("Referência de outro provedor");
  if (!ref.driveArquivoId) throw new Error("Original sem o id do arquivo no Drive");
  return ref.driveArquivoId;
}

const naoEncontrado = (erro: unknown) =>
  erro instanceof ErroDrive && erro.codigo === "nao_encontrado";

/** Junta um fluxo num Buffer (só para trechos e arquivos já limitados por quem chama). */
async function juntar(corpo: ReadableStream<Uint8Array>): Promise<Buffer> {
  const partes: Uint8Array[] = [];
  const leitor = corpo.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (value) partes.push(value);
  }
  return Buffer.concat(partes);
}

export function criarProvedorDrive({
  cliente,
  pastaRaizId,
}: {
  cliente: ClienteDrive;
  pastaRaizId: string;
}): ProvedorDeOriginais {
  /** A raiz em uso; muda se a `ClicouAI_Storage` sumir do Drive e for criada de novo. */
  let raiz = pastaRaizId;

  /** A pasta raiz existe e não está na lixeira (apagada ou na lixeira conta como não encontrada). */
  async function raizExiste(): Promise<boolean> {
    const meta = await cliente.metadados(raiz);
    return !!meta && !meta.lixeira;
  }

  /**
   * Raiz apagada ou na lixeira: esquece o id guardado na credencial e o cache das pastas (que
   * ficavam dentro dela) e acha ou cria `ClicouAI_Storage` de novo.
   */
  async function refazerRaiz(): Promise<void> {
    await esquecerPastaRaizDrive();
    raiz = await cliente.garantirPasta(PASTA_RAIZ_DRIVE, null);
    await definirPastaRaizDrive(raiz);
  }

  /** Id da pasta no Drive (cache primeiro; senão acha ou cria e guarda no cache). */
  async function pasta(
    fotografoId: string,
    eventoId: string | null,
    nome: string,
    paiId: string,
  ): Promise<string> {
    const emCache = await pastaDrive(fotografoId, eventoId);
    if (emCache) return emCache;
    const driveId = await cliente.garantirPasta(nome, paiId);
    return gravarPastaDrive({ fotografoId, eventoId, driveId });
  }

  async function pastaDoEvento(fotografoId: string, eventoId: string): Promise<string> {
    // A pasta do fotógrafo vai ser criada (ou achada) dentro da raiz: confere antes que a raiz
    // ainda existe, para não criar pasta dentro de uma raiz apagada ou na lixeira.
    if (!(await pastaDrive(fotografoId, null)) && !(await raizExiste())) await refazerRaiz();
    const doFotografo = await pasta(fotografoId, null, fotografoId, raiz);
    return pasta(fotografoId, eventoId, eventoId, doFotografo);
  }

  return {
    nome: "drive",

    async gravarOriginal({ chave, conteudo, tipo, fotografoId, eventoId, fotoId }) {
      const nome = nomeNoDrive(chave, fotoId);
      const enviar = async () =>
        cliente.enviarArquivo({
          nome,
          pastaId: await pastaDoEvento(fotografoId, eventoId),
          conteudo,
          tipo,
        });
      let enviado;
      try {
        enviado = await enviar();
      } catch (erro) {
        // Pasta do cache apagada no Drive: esquece as duas (e a raiz, se ela também sumiu) e
        // tenta uma vez de novo.
        if (!naoEncontrado(erro)) throw erro;
        await esquecerPastaDrive(fotografoId, eventoId);
        await esquecerPastaDrive(fotografoId, null);
        if (!(await raizExiste())) await refazerRaiz();
        try {
          enviado = await enviar();
        } catch (erroDeNovo) {
          // Ainda não encontrada: a próxima tentativa recomeça pela raiz.
          if (naoEncontrado(erroDeNovo)) await esquecerPastaRaizDrive().catch(() => {});
          throw erroDeNovo;
        }
      }
      // O cliente já confere tamanho e MD5; esta conferência barata fica como segunda trava.
      if (enviado.tamanho !== conteudo.length) {
        await cliente.apagarArquivo(enviado.id).catch(() => {});
        throw new Error(
          `Original gravado no Drive diferente do enviado (${enviado.tamanho} de ${conteudo.length} bytes)`,
        );
      }
      return { provedor: "drive", chave, driveArquivoId: enviado.id };
    },

    lerOriginal: async (ref) => cliente.lerArquivo(idNoDrive(ref)),

    async lerTrecho(ref, inicio, fim) {
      if (fim <= inicio) return Buffer.alloc(0);
      const baixado = await cliente.baixarArquivo(idNoDrive(ref), { inicio, fim: fim - 1 });
      const bytes = await juntar(baixado.corpo);
      // Se o Drive ignorou o Range e mandou o arquivo inteiro, recorta aqui.
      return baixado.status === 206 ? bytes : bytes.subarray(inicio, fim);
    },

    async tamanhoDoOriginal(ref) {
      const meta = await cliente.metadados(idNoDrive(ref));
      if (!meta || meta.lixeira) return null;
      return meta.tamanho;
    },

    async abrirFluxo(ref, range?: IntervaloDeBytes) {
      try {
        return await cliente.baixarArquivo(idNoDrive(ref), range);
      } catch (erro) {
        if (naoEncontrado(erro)) return null;
        throw erro;
      }
    },

    async removerOriginal(ref) {
      await cliente.apagarArquivo(idNoDrive(ref));
    },

    async entregaParaDownload(ref) {
      idNoDrive(ref);
      return { tipo: "fluxo" };
    },
  };
}
