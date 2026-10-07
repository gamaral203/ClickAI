import { NextResponse, type NextRequest } from "next/server";

// Loja própria no subdomínio (docs/arquitetura.md, "Loja própria"): liaramos.clicouai.com.br
// abre a loja de quem escolheu "liaramos". O proxy só reescreve o endereço; quem confere se a
// loja existe e está ativa é a página, porque o proxy não deve depender dos dados do app.
// O resto do site (eventos, carrinho, checkout) funciona igual no subdomínio. Os cookies de
// sessão não têm Domain, então ficam presos ao host em que foram criados.

const SUBDOMINIO = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

function hostDoSite() {
  try {
    return new URL(process.env.APP_URL || "http://localhost:3000").hostname.replace(/^www\./, "");
  } catch {
    return "localhost";
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

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  const host = hostDaRequisicao(request);
  const base = hostDoSite();
  if (!host.endsWith(`.${base}`)) return NextResponse.next();

  const subdominio = host.slice(0, -(base.length + 1));
  // Só um nível (nada de a.b.clicouai.com.br) e nunca o www.
  if (subdominio === "www" || !SUBDOMINIO.test(subdominio)) return NextResponse.next();

  const destino = request.nextUrl.clone();
  destino.pathname = `/loja/${subdominio}`;
  return NextResponse.rewrite(destino);
}

export const config = {
  // Só a raiz: as outras páginas são as mesmas do site em qualquer host.
  matcher: "/",
};
