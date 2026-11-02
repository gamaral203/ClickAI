// Limites do envio de fotos, os mesmos no navegador (src/components/painel/envio-fotos.tsx) e no
// servidor (src/servicos/envios.ts). Não há limite de quantidade de fotos por envio nem por
// evento: o lote só divide a seleção em chamadas pequenas. O tamanho não é regra de negócio:
// cada câmera e cada exportação dá um tamanho; só ficam os tetos técnicos abaixo.

const MB = 1024 * 1024;

/**
 * Teto por arquivo, só contra abuso e para caber na função que processa a foto. Folga para
 * qualquer foto final de evento: um JPEG de 100 MP fica em ~70 MB, um TIFF de 8 bits sem
 * compressão de 61 MP em ~180 MB e um TIFF de 16 bits de 45-60 MP com compressão ZIP/LZW em
 * 120-200 MB. O limite real é a memória da função (2 GB no padrão do plano Pro): o
 * arquivo inteiro fica na memória durante o processamento, mais ~150 MB da decodificação
 * reduzida, e uma instância pode processar mais de uma foto ao mesmo tempo (ver
 * ORCAMENTO_DE_MEMORIA_BYTES em src/servicos/envios.ts).
 */
export const LIMITE_FOTO_BYTES = 200 * MB;

/**
 * Pixels máximos do original (o `limitInputPixels` do Sharp). 160 milhões cobrem as maiores
 * câmeras de médio formato (Phase One IQ4 de 150 MP = 14204 x 10652 = 151 MP) com folga e barram
 * a "bomba de descompressão": um PNG de poucos KB que diz ter 50.000 x 50.000 pixels.
 */
export const LIMITE_PIXELS = 160_000_000;

/**
 * A partir deste tamanho o arquivo sobe em partes (upload multipart do R2): numa conexão ruim,
 * um PUT único de 100 MB que cai no fim recomeça do zero; em partes, só a parte que falhou é
 * reenviada. Abaixo disso, um PUT só é mais rápido (menos idas e voltas).
 */
export const MULTIPART_A_PARTIR_DE = 50 * MB;

/**
 * Tamanho de cada parte do multipart (o R2 exige pelo menos 5 MiB e partes iguais, menos a
 * última). 10 MB: até 20 partes num arquivo de 200 MB, e uma parte perdida custa pouco.
 */
export const TAMANHO_PARTE = 10 * MB;

/** Partes de um arquivo com `tamanho` bytes. */
export function quantasPartes(tamanho: number) {
  return Math.max(1, Math.ceil(tamanho / TAMANHO_PARTE));
}

/** Tamanho da parte `numero` (1, 2, 3...) de um arquivo com `tamanho` bytes. */
export function tamanhoDaParte(tamanho: number, numero: number) {
  return Math.min(TAMANHO_PARTE, tamanho - (numero - 1) * TAMANHO_PARTE);
}

/**
 * Foto parada em `processando` há mais disto (ou com a reserva vencida há mais disto) entra na
 * fila do servidor. Curto: a reserva (src/dados/processamento.ts) já impede de pegar uma foto que
 * outra chamada está processando, e um arquivo que ainda não chegou só vira erro depois de
 * ENVIO_PODE_ESTAR_SUBINDO_MS (src/servicos/envios.ts).
 */
export const ESPERA_FOTO_PRESA_MS = 2 * 60 * 1000;

/**
 * Foto com falha nos rostos volta à fila até este número de vezes; depois fica como pendente no
 * painel, com o botão "Cadastrar rostos que faltam".
 */
export const MAXIMO_DE_TENTATIVAS_DE_ROSTOS = 5;
/** A fila dos rostos só pega envios recentes (src/dados/fila-de-rostos.ts). */
export const JANELA_DA_FILA_DE_ROSTOS_MS = 14 * 24 * 60 * 60 * 1000;

/** Texto do limite para as mensagens. */
export const LIMITE_FOTO_TEXTO = "200 MB";

/**
 * Fotos por chamada de iniciarEnvio. Não é limite do envio: o navegador divide a seleção em
 * lotes deste tamanho sozinho. Só mantém cada chamada pequena (corpo, tempo e URLs assinadas).
 */
export const FOTOS_POR_LOTE = 50;
