// Vídeos aceitos no envio (docs/arquitetura.md, "Vídeos"): MP4 e MOV curtos, de até 30 segundos. O
// tipo real é conferido pelo conteúdo (a caixa `ftyp` do começo do arquivo), no navegador e de
// novo no servidor, como nas fotos (src/lib/tipos-imagem.ts). Usado nos dois lados.

export const FORMATOS_DE_VIDEO = ["mp4", "mov"] as const;
export type FormatoDeVideo = (typeof FORMATOS_DE_VIDEO)[number];

export const DADOS_DO_VIDEO: Record<
  FormatoDeVideo,
  { mime: string; extensao: string; extensoes: string[] }
> = {
  mp4: { mime: "video/mp4", extensao: "mp4", extensoes: ["mp4", "m4v"] },
  mov: { mime: "video/quicktime", extensao: "mov", extensoes: ["mov", "qt"] },
};

/** Duração máxima de um vídeo, em segundos (meio segundo de folga para o arredondamento). */
export const DURACAO_MAXIMA_VIDEO_S = 30;
export const FOLGA_DURACAO_S = 0.5;

/** Teto técnico do arquivo de vídeo: 30 segundos em 4K 60 qps de celular ficam em torno de 250 MB. */
export const LIMITE_VIDEO_BYTES = 300 * 1024 * 1024;
export const LIMITE_VIDEO_TEXTO = "300 MB";

export const MENSAGEM_VIDEO_LONGO =
  "Vídeo com mais de 30 segundos. Corte o trecho que interessa e envie de novo.";
export const MENSAGEM_FORMATO_VIDEO = "Formato de vídeo não aceito. Envie em MP4 ou MOV.";

/** Marcas da caixa `ftyp` dos vídeos MP4 mais comuns (câmeras, celulares, editores). */
const MARCAS_MP4 = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "M4VP",
  "mmp4",
  "dash",
  "XAVC",
  "3gp4",
  "3gp5",
  "3gp6",
]);

function texto(bytes: Uint8Array, inicio: number, fim: number) {
  let s = "";
  for (let i = inicio; i < Math.min(fim, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Formato de vídeo pelo começo do arquivo, ou `null` se não for MP4 nem MOV. */
export function detectarVideo(bytes: Uint8Array): FormatoDeVideo | null {
  if (bytes.length < 12 || texto(bytes, 4, 8) !== "ftyp") return null;
  const principal = texto(bytes, 8, 12);
  if (principal === "qt  ") return "mov";
  if (MARCAS_MP4.has(principal)) return "mp4";
  // Algumas câmeras põem a marca principal própria e a compatível depois.
  const tamanho = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  for (let i = 16; i + 4 <= Math.min(bytes.length, Math.max(16, tamanho)); i += 4) {
    const marca = texto(bytes, i, i + 4);
    if (marca === "qt  ") return "mov";
    if (MARCAS_MP4.has(marca)) return "mp4";
  }
  return null;
}

export function ehFormatoDeVideo(formato: string | null | undefined): formato is FormatoDeVideo {
  return formato === "mp4" || formato === "mov";
}

/** Formato de vídeo pela extensão de uma chave do R2 (`...uuid.mp4`), ou `null`. */
export function videoDaChave(chave: string): FormatoDeVideo | null {
  const ext = chave.slice(chave.lastIndexOf(".") + 1).toLowerCase();
  return FORMATOS_DE_VIDEO.find((f) => DADOS_DO_VIDEO[f].extensao === ext) ?? null;
}

/** "0:42", para o selo de duração na galeria. */
export function formatarDuracao(segundos: number) {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
