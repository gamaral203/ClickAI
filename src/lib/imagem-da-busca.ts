// Conferências da foto do rosto enviada à busca facial (a pública, por selfie, e a do painel do
// fotógrafo). A imagem só é lida em memória: nada aqui a grava nem a escreve em log.

/** O navegador já reduz a foto; 5 MB é folga para quem envia direto. */
export const TAMANHO_MAXIMO_SELFIE = 5 * 1024 * 1024;

/** Confere o tipo pelo conteúdo (JPEG, PNG ou WebP), não pela extensão nem pelo navegador. */
export function ehImagemDaBusca(bytes: Uint8Array) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return jpeg || png || webp;
}
