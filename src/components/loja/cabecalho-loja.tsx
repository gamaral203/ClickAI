import Image from "next/image";
import { Camera, Globe } from "lucide-react";

import type { RedesSociais } from "@/dados";
import { corDoTexto } from "@/lib/loja";

/**
 * Topo da página pública do fotógrafo (o link /fotografo/<endereço> e a loja): banner ao fundo,
 * logo, nome, descrição e redes. Sem banner, o fundo é a cor principal; com banner, um véu escuro
 * garante a leitura do texto branco sobre qualquer foto.
 */
export function CabecalhoLoja({
  nome,
  descricao,
  capa,
  logo,
  corPrimaria,
  corSecundaria,
  redes,
  className = "",
}: {
  nome: string;
  descricao: string | null;
  capa: string | null;
  logo: string | null;
  corPrimaria: string;
  corSecundaria: string;
  redes: RedesSociais;
  className?: string;
}) {
  const corTexto = capa ? "#ffffff" : corDoTexto(corPrimaria);
  return (
    <header
      className={`relative isolate overflow-hidden ${className}`}
      style={{ backgroundColor: corPrimaria, color: corTexto }}
    >
      {capa && (
        <>
          <Image src={capa} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/40 to-black/10"
          />
        </>
      )}
      <div
        className={`mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:px-8 ${capa ? "pt-28 pb-8 sm:pt-40" : "py-10"}`}
      >
        {logo ? (
          <span className="relative size-16 overflow-hidden rounded-full border-2 border-white/80 bg-white sm:size-20">
            <Image src={logo} alt={`Logo de ${nome}`} fill sizes="80px" className="object-cover" />
          </span>
        ) : (
          <span
            className="flex size-14 items-center justify-center rounded-full text-xl font-bold"
            style={{ backgroundColor: corSecundaria, color: corDoTexto(corSecundaria) }}
            aria-hidden="true"
          >
            {nome.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{nome}</h1>
        {descricao && <p className="max-w-2xl text-lg opacity-90">{descricao}</p>}
        <Redes redes={redes} />
      </div>
    </header>
  );
}

function Redes({ redes }: { redes: RedesSociais }) {
  const { instagram, site } = redes;
  // Só https: um "javascript:" salvo no perfil nunca vira link.
  const siteSeguro = site && /^https:\/\//i.test(site) ? site : null;
  if (!instagram && !siteSeguro) return null;
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
