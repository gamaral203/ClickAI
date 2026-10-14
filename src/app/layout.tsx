import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import "./globals.css";

import { caminhoTemTemaNoturno, COOKIE_TEMA, temaDoCookie } from "@/lib/tema";

// Inter em todo o site (docs/marca/marca.md): títulos em 800, texto em 400/500.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ClicouAí",
    template: "%s | ClicouAí",
  },
  description: "Encontre e compre as fotos do seu evento: corridas, festas, formaturas e esportes.",
};

// CSP com nonce (src/proxy.ts e src/lib/csp.ts): o nonce é novo a cada requisição, então o HTML
// não pode vir de um prerender feito no build (os scripts dele não teriam o nonce e o navegador
// os bloquearia). Esperar a requisição aqui faz todas as páginas renderizarem por requisição, e
// `instant = false` libera o layout de gerar a casca estática. Os dados continuam em cache
// ("use cache") e as partes lentas continuam em <Suspense>.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  // Modo noturno só no painel e na gestão, e só quando a pessoa escolheu (cookie); o site de
  // compra é sempre dia (src/lib/tema.ts). O caminho vem do proxy (x-caminho).
  const [guardados, cabecalhos] = await Promise.all([cookies(), headers()]);
  const escuro =
    caminhoTemTemaNoturno(cabecalhos.get("x-caminho")) &&
    temaDoCookie(guardados.get(COOKIE_TEMA)?.value) === "escuro";
  const classes = [inter.variable, geistMono.variable, "h-full antialiased", escuro && "dark"]
    .filter(Boolean)
    .join(" ");
  return (
    <html lang="pt-BR" className={classes}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
