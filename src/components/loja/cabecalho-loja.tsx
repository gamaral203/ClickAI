import Image from "next/image";
import { Camera, Globe } from "lucide-react";

import { BotaoCompartilhar } from "@/components/galeria/botao-compartilhar";
import type { RedesSociais } from "@/dados";
import { corDoTexto } from "@/lib/loja";

export type NumerosDoFotografo = { eventos: number; fotos: number; cidades: number };

/**
 * Topo da página pública do fotógrafo (o link /fotografo/<endereço> e a loja): banner de ponta a
 * ponta e, por cima da borda dele, o cartão com logo, nome, descrição, números e redes. Sem
 * banner, o fundo é um degradê da cor principal com textura de pontos.
 */
export function CabecalhoLoja({
  nome,
  descricao,
  capa,
  logo,
  corPrimaria,
  corSecundaria,
  redes,
  numeros,
  urlParaCompartilhar,
}: {
  nome: string;
  descricao: string | null;
  capa: string | null;
  logo: string | null;
  corPrimaria: string;
  corSecundaria: string;
  redes: RedesSociais;
  numeros?: NumerosDoFotografo;
  urlParaCompartilhar?: string;
}) {
  return (
    <header className="relative">
      <div
        className="relative h-44 overflow-hidden sm:h-64 lg:h-80"
        style={{
          backgroundColor: corPrimaria,
          backgroundImage: capa
            ? undefined
            : `radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.18) 1px, transparent 0), linear-gradient(135deg, ${corPrimaria}, color-mix(in oklab, ${corPrimaria} 55%, black))`,
          backgroundSize: capa ? undefined : "22px 22px, 100% 100%",
        }}
      >
        {capa && (
          <>
            <Image src={capa} alt="" fill priority sizes="100vw" className="object-cover" />
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent"
            />
          </>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <div className="relative -mt-14 flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:-mt-20 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <Logo nome={nome} logo={logo} corSecundaria={corSecundaria} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{nome}</h1>
              {descricao && (
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">{descricao}</p>
              )}
            </div>
          </div>

          {(numeros || urlParaCompartilhar || redes.instagram || redes.site) && (
            <div className="flex flex-col gap-4 border-t pt-5 md:flex-row md:items-center md:justify-between">
              {numeros && <Numeros numeros={numeros} />}
              <div className="flex flex-wrap items-center gap-2">
                <Redes redes={redes} />
                {urlParaCompartilhar && (
                  <BotaoCompartilhar url={urlParaCompartilhar} titulo={nome} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Logo({
  nome,
  logo,
  corSecundaria,
}: {
  nome: string;
  logo: string | null;
  corSecundaria: string;
}) {
  const classe =
    "relative -mt-16 size-24 shrink-0 overflow-hidden rounded-full border-4 border-card bg-card shadow-md sm:-mt-24 sm:size-32";
  if (logo) {
    return (
      <span className={classe}>
        <Image src={logo} alt={`Logo de ${nome}`} fill sizes="128px" className="object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${classe} flex items-center justify-center text-4xl font-bold sm:text-5xl`}
      style={{ backgroundColor: corSecundaria, color: corDoTexto(corSecundaria) }}
    >
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Numeros({ numeros }: { numeros: NumerosDoFotografo }) {
  const itens = [
    [numeros.eventos, numeros.eventos === 1 ? "evento" : "eventos"],
    [numeros.fotos, numeros.fotos === 1 ? "foto" : "fotos"],
    [numeros.cidades, numeros.cidades === 1 ? "cidade" : "cidades"],
  ] as const;
  return (
    <dl className="flex gap-6 sm:gap-10">
      {itens.map(([valor, rotulo]) => (
        <div key={rotulo} className="flex flex-col">
          <dt className="order-2 text-sm text-muted-foreground">{rotulo}</dt>
          <dd className="order-1 text-2xl font-bold tabular-nums">
            {valor.toLocaleString("pt-BR")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const estiloRede =
  "inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground";

function Redes({ redes }: { redes: RedesSociais }) {
  const { instagram, site } = redes;
  // Só https: um "javascript:" salvo no perfil nunca vira link.
  const siteSeguro = site && /^https:\/\//i.test(site) ? site : null;
  return (
    <>
      {instagram && (
        <a
          href={`https://instagram.com/${encodeURIComponent(instagram.replace(/^@/, ""))}`}
          target="_blank"
          rel="noopener noreferrer"
          className={estiloRede}
        >
          <Camera aria-hidden="true" className="size-4" />@{instagram.replace(/^@/, "")}
        </a>
      )}
      {siteSeguro && (
        <a href={siteSeguro} target="_blank" rel="noopener noreferrer" className={estiloRede}>
          <Globe aria-hidden="true" className="size-4" />
          {new URL(siteSeguro).host}
        </a>
      )}
    </>
  );
}
