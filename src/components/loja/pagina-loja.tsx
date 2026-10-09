import Link from "next/link";
import Script from "next/script";

import { CabecalhoLoja } from "@/components/loja/cabecalho-loja";
import { numerosDoFotografo, VitrineDoFotografo } from "@/components/loja/vitrine-do-fotografo";
import { listarEventosPublicados, totalVendidoComoAutor, type LojaPublica } from "@/dados";
import { urlDoSite } from "@/lib/endereco";
import { corDoTexto, idGaSeguro, idGtmSeguro } from "@/lib/loja";
import { situacaoDasMetas } from "@/lib/metas";

// Loja própria do fotógrafo (docs/arquitetura.md, "Loja própria"). Nada do que o fotógrafo
// digita vira HTML ou script: o nome e a descrição são texto, as cores passam pelo formato
// #rrggbb e o GA/GTM entram só pelo ID conferido.

/** Página da loja: a mesma no subdomínio e no domínio próprio. */
export async function PaginaDaLoja({ loja }: { loja: LojaPublica }) {
  const [eventos, vendido] = await Promise.all([
    listarEventosPublicados({ fotografoId: loja.fotografo.id }),
    totalVendidoComoAutor(loja.fotografo.id),
  ]);
  const conquista = situacaoDasMetas(vendido).conquistadas.at(-1)?.rotulo ?? null;
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
      <CabecalhoLoja
        nome={loja.nome}
        descricao={loja.descricao}
        capa={loja.fotografo.capa}
        logo={loja.fotografo.fotoPerfil}
        corPrimaria={loja.corPrimaria}
        corSecundaria={loja.corSecundaria}
        redes={loja.fotografo.redesSociais}
        numeros={numerosDoFotografo(eventos)}
        urlParaCompartilhar={urlDoSite(`/fotografo/${loja.fotografo.slug}`)}
        conquista={conquista}
      />

      <main className="flex flex-1 flex-col">
        <VitrineDoFotografo eventos={eventos} />
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
