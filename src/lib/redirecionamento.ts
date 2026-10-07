/**
 * Caminho interno seguro para onde voltar depois do login, ou o padrão. Recusa endereços de
 * outros sites ("https://…", "//site", "/\site"), para o parâmetro ?proximo= não virar um
 * redirecionamento aberto usado em golpes.
 */
export function caminhoSeguro(valor: unknown, padrao = "/minhas-compras") {
  if (typeof valor !== "string") return padrao;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return padrao;
  if (/[\r\n]/.test(valor) || valor.length > 300) return padrao;
  return valor;
}
