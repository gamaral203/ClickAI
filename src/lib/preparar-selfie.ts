// Prepara no navegador a foto do rosto usada na busca facial (a pública, por selfie, e a do
// painel do fotógrafo). Nada aqui grava a imagem: ela só é reduzida em memória e enviada.

/** Lado maior da foto enviada: suficiente para o rosto e leve para o celular enviar. */
export const LADO_MAXIMO_SELFIE = 1024;

/**
 * Reduz a foto e a regrava em JPEG no próprio navegador. Além de enviar menos dados, o canvas
 * descarta os metadados (GPS, aparelho) da foto original.
 */
export async function prepararSelfie(arquivo: File): Promise<Blob> {
  try {
    const imagem = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO_SELFIE / Math.max(imagem.width, imagem.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagem.width * escala);
    canvas.height = Math.round(imagem.height * escala);
    canvas.getContext("2d")?.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    return blob ?? arquivo;
  } catch {
    // Formato que o navegador não abre: vai o original e o servidor confere o tipo.
    return arquivo;
  }
}
