// Rotas de API que mudam algo com o cookie de sessão (fora das Server Actions, que o Next já
// confere) só aceitam chamadas da própria página do site: segura um formulário ou script de
// outro site usando a sessão de quem está logado (CSRF). O cookie de sessão também é SameSite.

/** `true` se a requisição veio de uma página do mesmo endereço (cabeçalhos Origin ou Sec-Fetch-Site). */
export function vemDoMesmoSite(request: Request): boolean {
  const origem = request.headers.get("origin");
  if (!origem) return request.headers.get("sec-fetch-site") === "same-origin";
  const bruto = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const host = bruto.split(",")[0].trim().toLowerCase();
  try {
    return host !== "" && new URL(origem).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
