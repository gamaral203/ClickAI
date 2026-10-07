import "server-only";

import QRCode from "qrcode";

export type QrCodeDoLink = {
  /** SVG para mostrar na tela, nítido em qualquer tamanho. */
  svg: string;
  /** PNG em data URL, grande o bastante para imprimir (cartaz, banner no local do evento). */
  pngDataUrl: string;
};

/**
 * QR Code de um link, gerado no servidor: o navegador não baixa a biblioteca. Correção de erro
 * "M" (15%): aguenta um pouco de sujeira ou dobra no papel sem deixar o código denso demais.
 */
export async function gerarQrCode(texto: string): Promise<QrCodeDoLink> {
  const opcoes = { errorCorrectionLevel: "M", margin: 2 } as const;
  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(texto, { ...opcoes, type: "svg" }),
    QRCode.toDataURL(texto, { ...opcoes, width: 1024 }),
  ]);
  return { svg, pngDataUrl };
}
