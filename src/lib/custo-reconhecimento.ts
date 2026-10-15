// Custo estimado de mandar imagens ao Amazon Rekognition (IndexFaces), para avisar o fotógrafo
// antes de uma ação que reenvia o evento inteiro ("Refazer o cadastro de todas"). É só um aviso:
// o preço real depende da faixa de uso da conta e do câmbio, e não muda nenhuma regra.

/** Preço estimado de cada imagem enviada ao IndexFaces, em dólares (região sa-east-1). */
export const CUSTO_REKOGNITION_POR_IMAGEM_USD = 0.0013;

const dolares = (casas: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

/**
 * Quantas imagens vão ao Rekognition ao cadastrar `itens` (fotos e vídeos) e quanto isso custa,
 * no máximo. Cada foto é uma imagem; cada vídeo, até `quadrosPorVideo` quadros.
 */
export function estimarCustoDoCadastro({
  itens,
  videos,
  quadrosPorVideo,
}: {
  itens: number;
  videos: number;
  quadrosPorVideo: number;
}) {
  const fotos = Math.max(0, itens - videos);
  const imagens = fotos + Math.max(0, videos) * quadrosPorVideo;
  return { imagens, usd: imagens * CUSTO_REKOGNITION_POR_IMAGEM_USD };
}

/**
 * 0,6513 → "US$ 0,65"; abaixo de um centavo de dólar, "menos de US$ 0,01". Com `casas`, o preço
 * unitário: formatarDolares(0.0013, 4) → "US$ 0,0013".
 */
export function formatarDolares(usd: number, casas = 2) {
  const minimo = 10 ** -casas;
  if (usd > 0 && usd < minimo) return `menos de ${dolares(casas).format(minimo)}`;
  return dolares(casas).format(usd);
}
