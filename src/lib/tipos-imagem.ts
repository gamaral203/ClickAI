// Tipo real de um arquivo de foto pelos primeiros bytes ("magic numbers"), igual no navegador
// (envio-fotos.tsx, antes de subir) e no servidor (src/servicos/envios.ts, antes de processar).
// Extensão e o MIME que o navegador informa não valem: um PNG renomeado para .jpg é PNG
// (docs/riscos.md, Upload).
//
// Aceitos e entregues ao comprador como chegaram: JPEG, PNG, WebP, TIFF e AVIF (o Sharp do
// servidor lê todos). HEIC/HEIF é reconhecido, mas o Sharp pré-compilado não decodifica HEVC
// (patentes): o navegador converte para JPEG antes de enviar (docs/arquitetura.md, "Upload").
// RAW é recusado: precisa ser revelado e exportado pelo fotógrafo.

/** Formatos que o servidor aceita e guarda como original. */
export const FORMATOS_ACEITOS = ["jpeg", "png", "webp", "tiff", "avif"] as const;
export type FormatoAceito = (typeof FORMATOS_ACEITOS)[number];

export type FormatoDetectado = FormatoAceito | "heic" | "raw";

export const DADOS_DO_FORMATO: Record<
  FormatoAceito,
  { mime: string; extensao: string; extensoes: string[] }
> = {
  jpeg: { mime: "image/jpeg", extensao: "jpg", extensoes: ["jpg", "jpeg", "jpe", "jfif"] },
  png: { mime: "image/png", extensao: "png", extensoes: ["png"] },
  webp: { mime: "image/webp", extensao: "webp", extensoes: ["webp"] },
  tiff: { mime: "image/tiff", extensao: "tif", extensoes: ["tif", "tiff"] },
  avif: { mime: "image/avif", extensao: "avif", extensoes: ["avif"] },
};

/** Extensões de RAW das câmeras (Canon, Nikon, Sony, Fuji, Olympus, Panasonic, Pentax, Leica...). */
const EXTENSOES_RAW = new Set([
  "3fr",
  "ari",
  "arw",
  "bay",
  "cap",
  "cr2",
  "cr3",
  "crw",
  "dcr",
  "dcs",
  "dng",
  "drf",
  "eip",
  "erf",
  "fff",
  "iiq",
  "k25",
  "kdc",
  "mef",
  "mos",
  "mrw",
  "nef",
  "nrw",
  "orf",
  "pef",
  "ptx",
  "raf",
  "raw",
  "rw2",
  "rwl",
  "rwz",
  "sr2",
  "srf",
  "srw",
  "x3f",
]);

export const MENSAGEM_RAW =
  "Arquivo RAW: exporte em JPEG (ou PNG/TIFF) no Lightroom/Capture One antes de enviar.";
export const MENSAGEM_FORMATO =
  "Formato não aceito. Envie a foto em JPEG, PNG, WebP, TIFF, AVIF ou HEIC.";

/** Bytes do início do arquivo que bastam para detectar o tipo (cabeçalho TIFF e caixa ftyp). */
export const BYTES_PARA_DETECTAR = 64 * 1024;

export function extensaoDoNome(nome: string) {
  const ponto = nome.lastIndexOf(".");
  return ponto < 0 ? "" : nome.slice(ponto + 1).toLowerCase();
}

export function ehNomeDeRaw(nome: string) {
  return EXTENSOES_RAW.has(extensaoDoNome(nome));
}

function texto(bytes: Uint8Array, inicio: number, fim: number) {
  let s = "";
  for (let i = inicio; i < Math.min(fim, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function comeca(bytes: Uint8Array, assinatura: number[], deslocamento = 0) {
  return assinatura.every((b, i) => bytes[deslocamento + i] === b);
}

/**
 * Marcas (brands) da caixa `ftyp` de um arquivo ISO BMFF (HEIF, AVIF, CR3, MP4...), ou `null`
 * se não começa com ela.
 */
function marcasIsoBmff(bytes: Uint8Array): string[] | null {
  if (bytes.length < 16 || texto(bytes, 4, 8) !== "ftyp") return null;
  const tamanhoCaixa = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const fim = Math.min(bytes.length, Math.max(16, tamanhoCaixa));
  const marcas = [texto(bytes, 8, 12)];
  for (let i = 16; i + 4 <= fim; i += 4) marcas.push(texto(bytes, i, i + 4));
  return marcas;
}

/**
 * TIFF que é RAW de câmera: CR2 (marca "CR" no byte 8), DNG (tag DNGVersion na primeira IFD) ou
 * primeira IFD de imagem reduzida (NewSubfileType = 1), o jeito de NEF, ARW, PEF e outros RAW
 * guardarem a miniatura na frente. TIFF exportado por editor começa pela imagem inteira.
 */
function tiffEhRaw(bytes: Uint8Array): boolean {
  if (texto(bytes, 8, 10) === "CR") return true;
  const pequeno = bytes[0] === 0x49; // "II": little endian
  const u16 = (i: number) =>
    pequeno ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
  const u32 = (i: number) =>
    (pequeno
      ? bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
      : (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  // BigTIFF ("+" no byte 2) não é usado por câmeras; a IFD de 8 bytes não é lida aqui.
  if (u16(2) !== 42) return false;
  const ifd = u32(4);
  if (ifd + 2 > bytes.length) return false;
  const entradas = u16(ifd);
  for (let n = 0; n < entradas; n++) {
    const e = ifd + 2 + n * 12;
    if (e + 12 > bytes.length) break;
    const tag = u16(e);
    if (tag === 0xc612) return true; // DNGVersion
    if (tag === 0x00fe) {
      // NewSubfileType (LONG): o bit 0 diz "versão reduzida de outra imagem".
      const tipo = u16(e + 2);
      const valor = tipo === 3 ? u16(e + 8) : u32(e + 8);
      if (valor & 1) return true;
    }
  }
  return false;
}

/**
 * Tipo real do arquivo pelos primeiros bytes (pelo menos BYTES_PARA_DETECTAR, ou o arquivo
 * inteiro se for menor). Com o nome, a extensão de RAW também conta (alguns RAW são TIFF por
 * dentro). `null`: não é uma foto que aceitamos.
 */
export function detectarFormato(bytes: Uint8Array, nome?: string): FormatoDetectado | null {
  if (nome && ehNomeDeRaw(nome)) return "raw";
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (texto(bytes, 0, 4) === "RIFF" && texto(bytes, 8, 12) === "WEBP") return "webp";
  if (texto(bytes, 0, 15) === "FUJIFILMCCD-RAW") return "raw"; // RAF
  // ORF (Olympus) e RW2 (Panasonic) usam variações do cabeçalho TIFF.
  if (["IIRO", "IIRS", "MMOR", "IIU\0"].includes(texto(bytes, 0, 4))) return "raw";
  if (texto(bytes, 0, 4) === "FOVb" || texto(bytes, 0, 4) === "\0MRM") return "raw"; // X3F, MRW
  if (texto(bytes, 6, 14) === "HEAPCCDR") return "raw"; // CRW
  const tiff =
    comeca(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    comeca(bytes, [0x4d, 0x4d, 0x00, 0x2a]) ||
    comeca(bytes, [0x49, 0x49, 0x2b, 0x00]) ||
    comeca(bytes, [0x4d, 0x4d, 0x00, 0x2b]);
  if (tiff) return tiffEhRaw(bytes) ? "raw" : "tiff";
  const marcas = marcasIsoBmff(bytes);
  if (marcas) {
    if (marcas.includes("crx ")) return "raw"; // CR3
    const principal = marcas[0];
    if (principal === "avif" || principal === "avis") return "avif";
    const hevc = ["heic", "heix", "hevc", "hevx", "heim", "heis"];
    if (hevc.includes(principal) || marcas.some((m) => hevc.includes(m))) return "heic";
    if (marcas.includes("avif") || marcas.includes("avis")) return "avif";
    // HEIF genérico (mif1/msf1) sem outra marca: na prática, HEVC de celular.
    if (principal === "mif1" || principal === "msf1") return "heic";
  }
  return null;
}

/** Formato aceito a partir da extensão de uma chave do R2 (`...uuid.tif`), ou `null`. */
export function formatoDaChave(chave: string): FormatoAceito | null {
  const ext = extensaoDoNome(chave);
  return FORMATOS_ACEITOS.find((f) => DADOS_DO_FORMATO[f].extensao === ext) ?? null;
}

/**
 * Nome do arquivo com a extensão certa para o formato real: mantém `IMG_1.JPEG` se for JPEG,
 * troca `IMG_1.jpg` por `IMG_1.png` se o conteúdo for PNG e acrescenta a extensão se não houver.
 */
export function nomeComExtensao(nome: string, formato: FormatoAceito) {
  const dados = DADOS_DO_FORMATO[formato];
  const ext = extensaoDoNome(nome);
  if (dados.extensoes.includes(ext)) return nome;
  const conhecidas = [
    ...FORMATOS_ACEITOS.flatMap((f) => DADOS_DO_FORMATO[f].extensoes),
    "heic",
    "heif",
  ];
  const base = conhecidas.includes(ext) ? nome.slice(0, -(ext.length + 1)) : nome;
  return `${base}.${dados.extensao}`;
}
