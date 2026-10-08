// Endereço público de prévias e miniaturas. As fotos enviadas guardam no banco a chave do
// objeto no bucket público do R2 (ex.: previas/{fotografo}/{evento}/{foto}.webp), e o endereço
// é montado na leitura com R2_URL_PUBLICA: trocar o r2.dev por um domínio próprio não exige
// mexer no banco. Os dados de exemplo guardam caminhos (/exemplo/...) ou URLs completas, que
// passam como estão.

/** URL da imagem a partir do que está gravado em `fotos.url_previa` / `fotos.url_miniatura`. */
export function urlPublica(valor: string): string {
  // "data:" só no ambiente de exemplo, sem R2 (banner e logo da página do fotógrafo).
  if (!valor || valor.startsWith("/") || /^(https?:\/\/|data:image\/)/i.test(valor)) return valor;
  const base = (process.env.R2_URL_PUBLICA ?? "").replace(/\/+$/, "");
  return `${base}/${valor}`;
}
