// Endereço público das imagens (docs/CLAUDE.md, "Regras que não podem ser quebradas"). Ponto
// central e único: toda imagem que vai ao navegador sai daqui.
//
// As fotos enviadas guardam no banco a chave do objeto no bucket público do R2 (ex.:
// previas/{fotografo}/{evento}/{foto}-v4.webp), e o endereço é montado na leitura com
// R2_URL_PUBLICA: trocar o r2.dev por um domínio próprio não exige mexer no banco.
//
// Falha segura: imagem de FOTO (prévia, miniatura, prévia do vídeo) só sai se for uma prévia
// protegida, isto é, um objeto dos prefixos `previas/` ou `miniaturas/` do bucket público, que
// só recebe o que o servidor gerou com a marca d'água gravada nos pixels (src/servicos/
// imagens.ts). Qualquer outra coisa (chave do original, upload temporário, URL de outro
// domínio, link do Google Drive, googleusercontent, data:) vira o aviso "Processando" e NUNCA
// o arquivo. O mesmo vale para a foto que ainda não ficou pronta (`fotos.status`).
//
// Capa enviada pelo dono do evento, banner e logo da loja são imagens de divulgação, fora dessa
// regra: saem como foram enviadas, por `urlPublica` (que ainda recusa domínio de fora do R2).

/** Imagem mostrada no lugar de uma prévia que ainda não existe ou não é protegida. */
export const IMAGEM_PROCESSANDO = "/marca/processando.svg";

/** Prefixos do bucket público que só guardam versões com marca d'água. */
const PREFIXOS_DE_PREVIA = ["previas/", "miniaturas/"] as const;

/** Prévias de exemplo (public/exemplo), já geradas com a marca por scripts/gerar-exemplos.ts. */
const CAMINHO_DE_EXEMPLO = /^\/exemplo\/(previas|miniaturas)\/[\w-]+\.webp$/;

/** Domínios que nunca podem chegar ao navegador como imagem de foto (originais fora do R2). */
const DOMINIOS_PROIBIDOS =
  /(^|\.)(drive\.google\.com|docs\.google\.com|googleusercontent\.com|googleapis\.com)$/i;

function baseDoR2() {
  return (process.env.R2_URL_PUBLICA ?? "").replace(/\/+$/, "");
}

/** Chave relativa sem truque de caminho (`..`, `//`, `\`, esquema ou consulta). */
function chaveLimpa(chave: string) {
  return /^[\w][\w./-]*$/.test(chave) && !chave.includes("..") && !chave.includes("//");
}

/**
 * A chave (ou a URL do próprio bucket público) é de uma prévia protegida: `previas/...` ou
 * `miniaturas/...` no bucket público, ou uma prévia de exemplo de public/exemplo.
 */
export function ehPreviaProtegida(valor: string | null | undefined): valor is string {
  if (!valor) return false;
  if (CAMINHO_DE_EXEMPLO.test(valor)) return true;
  const chave = chaveDoBucketPublico(valor);
  return chave !== null && PREFIXOS_DE_PREVIA.some((p) => chave.startsWith(p));
}

/** A chave no bucket público, de uma chave ou de uma URL do próprio bucket; senão `null`. */
function chaveDoBucketPublico(valor: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(valor) || valor.startsWith("/")) {
    const base = baseDoR2();
    if (!base || !/^https:\/\//i.test(base) || !valor.startsWith(`${base}/`)) return null;
    const chave = valor.slice(base.length + 1);
    return chaveLimpa(chave) ? chave : null;
  }
  return chaveLimpa(valor) ? valor : null;
}

/**
 * URL pública de uma imagem de FOTO (`fotos.url_previa`, `fotos.url_miniatura`,
 * `fotos.previa_video` e a prévia do celular). `pronta: false` (foto ainda em processamento ou
 * com erro) também vira o aviso: a chave da prévia é gravada antes de o arquivo existir.
 */
export function urlDaPrevia(
  valor: string | null | undefined,
  { pronta = true }: { pronta?: boolean } = {},
): string {
  if (!pronta || !ehPreviaProtegida(valor)) return IMAGEM_PROCESSANDO;
  if (CAMINHO_DE_EXEMPLO.test(valor)) return valor;
  const chave = chaveDoBucketPublico(valor)!;
  return `${baseDoR2()}/${chave}`;
}

/**
 * URL de imagens de divulgação, que não são foto nem vídeo à venda (logo e banner da loja, capa
 * enviada pelo dono do evento, que sai como foi enviada): chave do bucket público, caminho do
 * próprio site ou data: gerado pelo servidor. URL de outro domínio (inclusive Google Drive e
 * googleusercontent) não passa: vira o aviso "Processando". Para foto ou vídeo à venda, use
 * `urlDaPrevia`.
 */
export function urlPublica(valor: string): string {
  if (!valor) return valor;
  // "data:" só no ambiente de exemplo, sem R2 (banner e logo da página do fotógrafo).
  if (/^data:image\//i.test(valor)) return valor;
  if (valor.startsWith("/") && !valor.startsWith("//")) return valor;
  if (/^[a-z][a-z0-9+.-]*:/i.test(valor))
    return doBucketPublico(valor) ? valor : IMAGEM_PROCESSANDO;
  if (!chaveLimpa(valor)) return IMAGEM_PROCESSANDO;
  return `${baseDoR2()}/${valor}`;
}

/**
 * URL completa de um bucket do R2 (o domínio de R2_URL_PUBLICA ou um r2.dev), em https. Outro
 * domínio, como o do Google Drive, não passa.
 */
function doBucketPublico(valor: string) {
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:" || DOMINIOS_PROIBIDOS.test(url.hostname)) return false;
    const base = baseDoR2();
    const hostDaBase = base ? new URL(base).hostname : null;
    return url.hostname === hostDaBase || url.hostname.endsWith(".r2.dev");
  } catch {
    return false;
  }
}
