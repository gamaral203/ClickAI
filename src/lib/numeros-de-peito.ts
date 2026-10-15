// Número de peito (bib): o que conta como número na leitura das fotos e na busca. Sem nada do
// servidor, para servir também ao formulário do evento e aos testes. A leitura em si fica em
// src/servicos/numeros.ts (Rekognition DetectText ou o modo simulado).
//
// Decisões (docs/arquitetura.md, "Número de peito"):
// - Só dígitos, de 1 a 6. Prefixo de letra ("A123", "M-45") fica de fora: a busca do site só
//   aceita dígitos, e aceitar letras trazia muito texto de patrocinador e de placa ("KM5").
// - Zeros à esquerda saem dos dois lados (gravação e busca): "0123" e "123" são o mesmo peito.
// - Datas e horários ("12:30", "15/03/2024", "15.03") nunca viram número, porque têm separador.
//   Um ano solto ("2024") vale: é um número de peito possível.
// - Um dígito só entra com confiança alta (CONFIANCA_UM_DIGITO): "1" e "7" aparecem em relógio,
//   camiseta e logotipo o tempo todo.

/** Slugs das categorias em que a leitura nasce ligada (esportes com número no peito). */
export const CATEGORIAS_COM_NUMERO: readonly string[] = [
  "corrida",
  "ciclismo",
  "esportes",
  "esportes-aquaticos",
];

export function categoriaComNumero(slug: string | null | undefined) {
  return Boolean(slug && CATEGORIAS_COM_NUMERO.includes(slug));
}

/** Até 6 dígitos (o mesmo limite da busca no site). */
export const MAXIMO_DE_DIGITOS = 6;

/** Confiança mínima padrão (0–100); REKOGNITION_TEXTO_CONFIANCA muda, entre 50 e 99. */
export const CONFIANCA_PADRAO = 85;
/** Número de um dígito só entra com esta confiança (ou a configurada, se for maior). */
export const CONFIANCA_UM_DIGITO = 95;
/**
 * Altura mínima da caixa do texto, em fração da altura da imagem: abaixo disso é número de
 * fundo (placa, relógio, peito de quem passa longe), que o cliente nem reconheceria. Na cópia de
 * 1920 px usada na leitura, dá ~29 px.
 */
export const ALTURA_MINIMA = 0.015;
/** Números guardados por foto, no máximo (foto de largada com dezenas de peitos). */
export const MAXIMO_POR_FOTO = 30;

export function confiancaMinima(valor = process.env.REKOGNITION_TEXTO_CONFIANCA) {
  const n = Number(valor);
  return valor !== undefined && valor !== "" && Number.isFinite(n) && n >= 50 && n <= 99
    ? n
    : CONFIANCA_PADRAO;
}

/**
 * "0123" → "123"; "  42 " → "42"; "0" → "0". `null` para o que não é número de peito (letras,
 * separadores, mais de 6 dígitos, vazio). Vale na gravação, na correção manual e na busca.
 */
export function normalizarNumero(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const limpo = texto.trim();
  if (!new RegExp(`^\\d{1,${MAXIMO_DE_DIGITOS}}$`).test(limpo)) return null;
  return limpo.replace(/^0+(?=\d)/, "");
}

export type CaixaDoNumero = { esquerda: number; topo: number; largura: number; altura: number };

/** O que interessa de cada item do DetectText (TextDetections). */
export type TextoDetectado = {
  DetectedText?: string;
  Type?: string;
  Confidence?: number;
  Geometry?: {
    BoundingBox?: { Left?: number; Top?: number; Width?: number; Height?: number };
  };
};

export type NumeroLido = { numero: string; confianca: number; caixa: CaixaDoNumero | null };

/**
 * Tira de uma palavra o que costuma vir grudado no número sem fazer parte dele: "#" na frente
 * e pontuação no fim ("1027." ou "1027,"). O resto precisa ser só dígitos.
 */
function limparToken(texto: string) {
  return texto
    .trim()
    .replace(/^#/, "")
    .replace(/[.,;]+$/, "");
}

/**
 * Candidatos a número de peito numa resposta do DetectText: palavras (WORD) e linhas (LINE) de
 * um token só, com dígitos apenas, confiança e altura mínimas. Linha com espaço ("10 KM",
 * "15 03 2024") não junta os pedaços: cada palavra já vem sozinha como WORD. Um número que
 * aparece mais de uma vez fica com a maior confiança. Ordem: maior confiança primeiro.
 */
export function extrairNumeros(
  deteccoes: readonly TextoDetectado[],
  opcoes: { confianca?: number; alturaMinima?: number; maximo?: number } = {},
): NumeroLido[] {
  const minima = opcoes.confianca ?? CONFIANCA_PADRAO;
  const alturaMinima = opcoes.alturaMinima ?? ALTURA_MINIMA;
  const porNumero = new Map<string, NumeroLido>();
  for (const d of deteccoes) {
    if (d.Type !== "WORD" && d.Type !== "LINE") continue;
    const texto = d.DetectedText ?? "";
    if (/\s/.test(texto.trim())) continue;
    const token = limparToken(texto);
    const numero = normalizarNumero(token);
    if (numero === null) continue;
    const confianca = d.Confidence ?? 0;
    const exigida = token.length === 1 ? Math.max(minima, CONFIANCA_UM_DIGITO) : minima;
    if (confianca < exigida) continue;
    const b = d.Geometry?.BoundingBox;
    const altura = b?.Height ?? 0;
    if (altura < alturaMinima) continue;
    const caixa =
      b && b.Left !== undefined && b.Top !== undefined && b.Width && b.Height
        ? { esquerda: b.Left, topo: b.Top, largura: b.Width, altura: b.Height }
        : null;
    const atual = porNumero.get(numero);
    if (!atual || confianca > atual.confianca) porNumero.set(numero, { numero, confianca, caixa });
  }
  return [...porNumero.values()]
    .sort((a, b) => b.confianca - a.confianca || a.numero.localeCompare(b.numero))
    .slice(0, opcoes.maximo ?? MAXIMO_POR_FOTO);
}
