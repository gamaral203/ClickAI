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
  if (typeof valor !== "string") return padrao;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return padrao;
  if (/[\r\n]/.test(valor) || valor.length > 300) return padrao;
  return valor;
}
