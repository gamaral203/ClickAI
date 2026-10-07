import "server-only";

/**
 * Endereço público do site (APP_URL), sem barra no fim. Vem da configuração e nunca do
 * cabeçalho Host da requisição, que quem chama pode trocar. Sem APP_URL, usa o endereço local.
 */
export function enderecoDoSite() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Endereço completo de uma página do site, para compartilhar fora dele (link e QR Code). */
export function urlDoSite(caminho: string) {
  return `${enderecoDoSite()}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}

/**
 * Endereço público da loja: um subdomínio do site (`https://liaramos.clicouai.com.br`). Em
 * desenvolvimento, `http://liaramos.localhost:3000` (o navegador resolve *.localhost sozinho).
 */
export function enderecoDaLoja(subdominio: string) {
  const base = new URL(enderecoDoSite());
  const host = base.host.replace(/^www\./, "");
  return `${base.protocol}//${subdominio}.${host}`;
}
