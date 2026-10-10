import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { connection } from "next/server";
import "./globals.css";

import { COOKIE_TEMA, temaDoCookie } from "@/lib/tema";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
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
  // Modo noturno só quando a pessoa escolheu (cookie); o padrão é o dia (src/lib/tema.ts).
  const escuro = temaDoCookie((await cookies()).get(COOKIE_TEMA)?.value) === "escuro";
  const classes = [jakarta.variable, geistMono.variable, "h-full antialiased", escuro && "dark"]
    .filter(Boolean)
    .join(" ");
  return (
    <html lang="pt-BR" className={classes}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
