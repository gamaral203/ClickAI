import Link from "next/link";
import Script from "next/script";
import { Camera, Globe } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { listarEventosPublicados, type LojaPublica } from "@/dados";
import { corDoTexto, idGaSeguro, idGtmSeguro } from "@/lib/loja";

// Loja própria do fotógrafo (docs/arquitetura.md, "Loja própria"). Nada do que o fotógrafo
// digita vira HTML ou script: o nome e a descrição são texto, as cores passam pelo formato
// #rrggbb e o GA/GTM entram só pelo ID conferido.

/** Página da loja: a mesma no subdomínio e no domínio próprio. */
export async function PaginaDaLoja({ loja }: { loja: LojaPublica }) {
  const eventos = await listarEventosPublicados({ fotografoId: loja.fotografo.id });
  const textoPrimaria = corDoTexto(loja.corPrimaria);

  return (
    <div
      className="flex flex-1 flex-col"
      // As variáveis do tema passam a ser as cores da loja: botões e links do site ficam com
      // a cara do fotógrafo sem repetir componente.
      style={
        {
          "--primary": loja.corPrimaria,
          "--primary-foreground": textoPrimaria,
          "--ring": loja.corPrimaria,
        } as React.CSSProperties
      }
    >
      <Medicao loja={loja} />
      <header style={{ backgroundColor: loja.corPrimaria, color: textoPrimaria }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-12">
          <span
            className="flex size-14 items-center justify-center rounded-full text-xl font-bold"
            style={{ backgroundColor: loja.corSecundaria, color: corDoTexto(loja.corSecundaria) }}
            aria-hidden="true"
          >
            {loja.nome.trim().charAt(0).toUpperCase()}
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {loja.nome}
          </h1>
          {loja.descricao && <p className="max-w-2xl text-lg opacity-90">{loja.descricao}</p>}
          <Redes loja={loja} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10">
        <h2 className="text-2xl font-semibold">Eventos</h2>
        {eventos.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {eventos.map((evento) => (
              <li key={evento.id} className="flex">
                <CartaoEvento evento={evento} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            Nenhum evento publicado ainda. Volte em breve.
          </p>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground">
          <span>{loja.fotografo.nomePublico}</span>
          <Link href="/" className="hover:text-foreground">
            Vendido pelo ClicouAí
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Redes({ loja }: { loja: LojaPublica }) {
  const { instagram, site } = loja.fotografo.redesSociais;
  if (!instagram && !site) return null;
  // Só https: um "javascript:" salvo no perfil nunca vira link.
  const siteSeguro = site && /^https:\/\//i.test(site) ? site : null;
  return (
    <div className="flex flex-wrap gap-4 text-sm font-medium">
      {instagram && (
        <a
          href={`https://instagram.com/${encodeURIComponent(instagram.replace(/^@/, ""))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Camera aria-hidden="true" className="size-4" />@{instagram.replace(/^@/, "")}
        </a>
      )}
      {siteSeguro && (
        <a
          href={siteSeguro}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Globe aria-hidden="true" className="size-4" />
          {new URL(siteSeguro).host}
        </a>
      )}
    </div>
  );
}

/**
 * Google Analytics e Tag Manager montados por nós a partir do ID (docs/riscos.md, prioridade
 * alta). O ID é conferido de novo aqui e entra no script como texto JSON, nunca colado cru.
 */
function Medicao({ loja }: { loja: LojaPublica }) {
  const ga = idGaSeguro(loja.gaId);
  const gtm = idGtmSeguro(loja.gtmId);
  return (
    <>
      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`}
            strategy="afterInteractive"
          />
          <Script id="loja-ga" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config",${JSON.stringify(ga)});`}
          </Script>
        </>
      )}
      {gtm && (
        <Script id="loja-gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+encodeURIComponent(i);f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer",${JSON.stringify(gtm)});`}
        </Script>
      )}
    </>
  );
}
