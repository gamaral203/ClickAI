import { NextResponse, type NextRequest } from "next/server";

import { gerarNonce, politicaDeSeguranca } from "@/lib/csp";

// Loja própria (docs/arquitetura.md, "Loja própria"):
// - no subdomínio: liaramos.clicouai.com abre a loja de quem escolheu "liaramos";
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

/** Página da loja para este host, ou `null` se a raiz é a do site. Só vale para "/". */
function lojaDoHost(request: NextRequest): string | null {
  const host = hostDaRequisicao(request);
  // Sem APP_URL, "localhost" faz o papel do domínio do site (desenvolvimento).
  const base = hostDoSite() ?? "localhost";
  if (host === base || host === `www.${base}`) return null;

  if (host.endsWith(`.${base}`)) {
    const subdominio = host.slice(0, -(base.length + 1));
    // Só um nível (nada de a.b.clicouai.com) e nunca o www.
    if (subdominio === "www" || !SUBDOMINIO.test(subdominio)) return null;
    return `/loja/${subdominio}`;
  }

  // Domínio próprio: só com APP_URL configurado. Sem ele, o domínio real do site seria
  // confundido com o domínio de uma loja e a página inicial viraria "loja não encontrada".
  if (!hostDoSite() || hostDaPlataforma(host) || !DOMINIO.test(host)) return null;
  return `/loja/dominio/${host}`;
}

export function proxy(request: NextRequest) {
  // CSP com nonce novo (src/lib/csp.ts). O Next.js lê o nonce do cabeçalho da requisição e o
  // coloca nos próprios scripts ao renderizar a página.
  const nonce = gerarNonce();
  const csp = politicaDeSeguranca({
    nonce,
    desenvolvimento: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Só com a chave do Maps a página carrega o Google Maps (src/servicos/mapa.ts).
    googleMaps: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()),
  });
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("x-nonce", nonce);
  cabecalhos.set("content-security-policy", csp);

  const loja = request.nextUrl.pathname === "/" ? lojaDoHost(request) : null;
  let resposta: NextResponse;
  if (loja) {
    const destino = request.nextUrl.clone();
    destino.pathname = loja;
    resposta = NextResponse.rewrite(destino, { request: { headers: cabecalhos } });
  } else {
    resposta = NextResponse.next({ request: { headers: cabecalhos } });
  }
  resposta.headers.set("content-security-policy", csp);
  return resposta;
}

export const config = {
  matcher: [
    // A raiz sempre (até no prefetch), por causa da loja no subdomínio ou domínio próprio.
    "/",
    // As outras páginas, para a CSP. Ficam de fora as rotas de API, os arquivos do build e os
    // arquivos estáticos, que não são HTML, e os prefetches do next/link.
    {
      source: "/((?!api/|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|svg|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
