// Tipo e nome do arquivo original no download, para foto ou vídeo: o tipo vem da extensão da
// chave no R2 (a do formato real conferido no envio), e o nome ganha a extensão certa.

import {
  DADOS_DO_FORMATO,
  formatoDaChave,
  nomeComExtensao,
  type FormatoAceito,
} from "./tipos-imagem";
import { DADOS_DO_VIDEO, ehFormatoDeVideo, videoDaChave, type FormatoDeVideo } from "./tipos-video";

/**
 * Tipo (mime) de um formato aceito no envio, foto ou vídeo. É o que o navegador declara no PUT ao
 * R2 e tem de ser igual ao assinado no servidor.
 */
export function mimeDoFormato(formato: FormatoAceito | FormatoDeVideo) {
  return ehFormatoDeVideo(formato) ? DADOS_DO_VIDEO[formato].mime : DADOS_DO_FORMATO[formato].mime;
}

/** Tipo (mime) e extensão do original pela chave. Sem extensão conhecida, vale JPEG. */
export function tipoDoOriginal(chave: string) {
  const video = videoDaChave(chave);
  if (video) return { mime: DADOS_DO_VIDEO[video].mime, extensao: DADOS_DO_VIDEO[video].extensao };
  const formato = formatoDaChave(chave) ?? "jpeg";
  return { mime: DADOS_DO_FORMATO[formato].mime, extensao: DADOS_DO_FORMATO[formato].extensao };
}

/** Nome do arquivo baixado, com a extensão do formato real (foto ou vídeo). */
export function nomeDoArquivoOriginal(nomeArquivo: string, chave: string) {
  const video = videoDaChave(chave);
  if (!video) return nomeComExtensao(nomeArquivo, formatoDaChave(chave) ?? "jpeg");
  const ext = nomeArquivo.slice(nomeArquivo.lastIndexOf(".") + 1).toLowerCase();
  if (DADOS_DO_VIDEO[video].extensoes.includes(ext)) return nomeArquivo;
  const base =
    nomeArquivo.lastIndexOf(".") > 0
      ? nomeArquivo.slice(0, nomeArquivo.lastIndexOf("."))
      : nomeArquivo;
  return `${base}.${DADOS_DO_VIDEO[video].extensao}`;
}
