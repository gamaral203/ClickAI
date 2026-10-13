// Tipo e nome do arquivo original no download, para foto ou vídeo: o tipo vem da extensão da
// chave no R2 (a do formato real conferido no envio), e o nome ganha a extensão certa.

import { DADOS_DO_FORMATO, formatoDaChave, nomeComExtensao } from "./tipos-imagem";
import { DADOS_DO_VIDEO, videoDaChave } from "./tipos-video";

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
