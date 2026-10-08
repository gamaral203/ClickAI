/**
 * Caminho interno seguro para onde voltar depois do login, ou o padrão. Recusa endereços de
 * outros sites ("https://…", "//site", "/\site"), para o parâmetro ?proximo= não virar um
 * redirecionamento aberto usado em golpes.
 */
/**
 * Entrar ou criar conta a partir do link de um fotógrafo (/fotografo/<endereço>) volta para a
 * biblioteca dele; de qualquer outra página, segue o destino padrão.
 */
export function comRetorno(href: "/entrar" | "/cadastro", caminho: string | null) {
  if (!caminho?.startsWith("/fotografo/")) return href;
  return `${href}?proximo=${encodeURIComponent(caminho)}`;
}

/** Destino depois de criar a conta: a tela principal (o painel, para fotógrafos) ou o ?proximo=. */
export function destinoDoCadastro(proximo: unknown, papel: string) {
  return caminhoSeguro(proximo, papel === "fotografo" ? "/painel" : "/");
}

export function caminhoSeguro(valor: unknown, padrao = "/minhas-compras") {
  if (typeof valor !== "string" || valor.length > 300) return padrao;
  // Barra invertida e caracteres de controle (TAB, quebra de linha) ficam de fora: o navegador
  // e o parser de URL os descartam ou trocam por "/", e "/\t/site.com" viraria "//site.com".
  if (!valor.startsWith("/") || /[\\\x00-\x1f\x7f]/.test(valor)) return padrao;
  // Confere pelo próprio parser de URL: o resultado tem de continuar no mesmo site.
  const base = "https://clicouai.invalid";
  let url: URL;
  try {
    url = new URL(valor, base);
  } catch {
    return padrao;
  }
  if (url.origin !== base) return padrao;
  return url.pathname + url.search + url.hash;
}
