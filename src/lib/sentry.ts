import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// Configuração comum do Sentry (servidor, edge e navegador). Sem SENTRY_DSN, nada é enviado.
//
// O que nunca sai daqui (docs/riscos.md e LGPD):
// - tokens de acesso a pedidos e links assinados (?token=…), que valem como senha;
// - cookies, cabeçalho Authorization e corpo das requisições: a selfie da busca facial vai no
//   corpo e não pode ser gravada em lugar nenhum, nem em log de erro.

/**
 * O parâmetro secreto no começo do texto (query string sem "?") ou depois de ?, & ou # (o link de
 * "Esqueci a senha" leva o token depois do #: /entrar/nova-senha#token=…).
 */
const PARAMETROS_SECRETOS = /((?:^|[?&#])(?:token|code|state|acesso)=)[^&#\s"']+/gi;

export function limparTexto<T>(valor: T): T {
  return (
    typeof valor === "string" ? valor.replace(PARAMETROS_SECRETOS, "$1[removido]") : valor
  ) as T;
}

function limparBreadcrumb(b: Breadcrumb): Breadcrumb {
  const data = b.data ? { ...b.data } : undefined;
  if (data)
    for (const chave of ["url", "from", "to"])
      if (chave in data) data[chave] = limparTexto(data[chave]);
  return { ...b, message: limparTexto(b.message), data };
}

/** `beforeSend` do Sentry: tira segredos e dados pessoais do evento antes de enviar. */
export function limparEvento(evento: ErrorEvent): ErrorEvent {
  if (evento.request) {
    const { headers, ...resto } = evento.request;
    const cabecalhos = { ...headers };
    for (const nome of Object.keys(cabecalhos)) {
      if (/^(cookie|authorization|x-signature)$/i.test(nome)) delete cabecalhos[nome];
    }
    evento.request = {
      ...resto,
      url: limparTexto(resto.url),
      query_string:
        typeof resto.query_string === "string" ? limparTexto(resto.query_string) : undefined,
      headers: cabecalhos,
      cookies: undefined,
      data: undefined,
    };
  }
  if (evento.breadcrumbs) evento.breadcrumbs = evento.breadcrumbs.map(limparBreadcrumb);
  if (evento.message) evento.message = limparTexto(evento.message);
  // Usuário só pelo id: sem e-mail, nome nem IP.
  if (evento.user) evento.user = evento.user.id ? { id: evento.user.id } : undefined;
  return evento;
}

/** Opções comuns do Sentry.init. */
export function opcoesSentry(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Amostra pequena de desempenho: o plano gratuito tem cota e erro é o que importa.
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
    sendDefaultPii: false,
    beforeSend: limparEvento,
    beforeBreadcrumb: limparBreadcrumb,
  };
}
