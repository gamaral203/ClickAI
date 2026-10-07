import { NextResponse, type NextRequest } from "next/server";

// Loja própria (docs/arquitetura.md, "Loja própria"):
// - no subdomínio: liaramos.clicouai.com.br abre a loja de quem escolheu "liaramos";
// - no domínio próprio: fotos.liaramos.com.br abre a loja que conectou esse domínio.
// O proxy só reescreve o endereço; quem confere se a loja existe, está ativa e (no domínio
// próprio) verificada é a página, porque o proxy não deve depender dos dados do app.
// O resto do site (eventos, carrinho, checkout) funciona igual em qualquer host. Os cookies de
// sessão não têm Domain, então ficam presos ao host em que foram criados.

const SUBDOMINIO = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const DOMINIO = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function hostDoSite(): string | null {
  const url = process.env.APP_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Host pedido pelo navegador, sem a porta. Vem do cabeçalho: o `nextUrl.hostname` pode estar
 * normalizado para o host do servidor (em desenvolvimento, sempre "localhost").
 */
function hostDaRequisicao(request: NextRequest) {
  const bruto = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return bruto.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

/** Hosts que são sempre o site principal, nunca uma loja. */
function hostDaPlataforma(host: string) {
  return (
    host === "localhost" ||
    host.endsWith(".vercel.app") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.startsWith("[")
  );
}

function reescrever(request: NextRequest, caminho: string) {
  const destino = request.nextUrl.clone();
  destino.pathname = caminho;
  return NextResponse.rewrite(destino);
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  const host = hostDaRequisicao(request);
  // Sem APP_URL, "localhost" faz o papel do domínio do site (desenvolvimento).
  const base = hostDoSite() ?? "localhost";
  if (host === base || host === `www.${base}`) return NextResponse.next();

  if (host.endsWith(`.${base}`)) {
    const subdominio = host.slice(0, -(base.length + 1));
    // Só um nível (nada de a.b.clicouai.com.br) e nunca o www.
    if (subdominio === "www" || !SUBDOMINIO.test(subdominio)) return NextResponse.next();
    return reescrever(request, `/loja/${subdominio}`);
  }

  // Domínio próprio: só com APP_URL configurado. Sem ele, o domínio real do site seria
  // confundido com o domínio de uma loja e a página inicial viraria "loja não encontrada".
  if (!hostDoSite() || hostDaPlataforma(host) || !DOMINIO.test(host)) return NextResponse.next();
  return reescrever(request, `/loja/dominio/${host}`);
}

export const config = {
  // Só a raiz: as outras páginas são as mesmas do site em qualquer host.
  matcher: "/",
};
