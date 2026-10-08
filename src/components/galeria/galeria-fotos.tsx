"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { carregarMaisFotos } from "@/app/(publico)/eventos/[slug]/acoes";
import { Button } from "@/components/ui/button";
import type { FiltroGaleria } from "@/dados";
import type { Foto, PaginaDeFotos } from "@/dados/tipos";

type Props = {
  slug: string;
  tituloEvento: string;
  paginaInicial: PaginaDeFotos;
  /** Filtro da primeira página, repetido ao carregar as seguintes. */
  filtro?: FiltroGaleria;
  /** Texto quando a página inicial vem vazia. */
  vazio?: { titulo: string; detalhe: string };
  /**
   * Onde está o rosto da pessoa em cada foto (resultado da busca por selfie): a miniatura fica
   * ampliada no rosto, para ela se reconhecer mais rápido.
   */
  recortes?: Record<string, CaixaDoRosto>;
};

type CaixaDoRosto = { esquerda: number; topo: number; largura: number; altura: number };

/**
 * Estilo que amplia a imagem no rosto: centraliza o recorte nele e aproxima até o rosto ocupar
 * perto de metade do quadrado (no máximo 3x, para não pixelar a prévia).
 */
function estiloDoRecorte(c: CaixaDoRosto): React.CSSProperties {
  const x = (c.esquerda + c.largura / 2) * 100;
  const y = (c.topo + c.altura / 2) * 100;
  const escala = Math.min(3, Math.max(1, 0.45 / Math.max(c.largura, c.altura)));
  const origem = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  return {
    objectPosition: origem,
    transformOrigin: origem,
    transform: `scale(${escala.toFixed(2)})`,
  };
}

const VAZIO_PADRAO = {
  titulo: "Ainda não há fotos neste evento.",
  detalhe: "O fotógrafo pode estar enviando agora. Volte daqui a pouco.",
};

export function GaleriaFotos({
  slug,
  tituloEvento,
  paginaInicial,
  filtro,
  vazio = VAZIO_PADRAO,
  recortes,
}: Props) {
  const [fotos, setFotos] = useState<Foto[]>(paginaInicial.fotos);
  const [cursor, setCursor] = useState(paginaInicial.proximoCursor);
  const [erro, setErro] = useState(false);
  const [carregando, startTransition] = useTransition();

  function carregarMais() {
    if (!cursor) return;
    setErro(false);
    startTransition(async () => {
      try {
        const pagina = await carregarMaisFotos(slug, cursor, filtro);
        setFotos((atuais) => [...atuais, ...pagina.fotos]);
        setCursor(pagina.proximoCursor);
      } catch {
        setErro(true);
      }
    });
  }

  if (fotos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">{vazio.titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{vazio.detalhe}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {fotos.map((foto, i) => (
          <li key={foto.id}>
            <Link
              href={`/fotos/${foto.id}`}
              className="group relative block aspect-square overflow-hidden rounded-lg bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {recortes?.[foto.id] ? (
                // Ampliada no rosto: usa a prévia (maior) para não pixelar com o zoom.
                <Image
                  src={foto.urlPrevia}
                  alt={`Foto ${i + 1} de ${tituloEvento}, ampliada no seu rosto`}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                  style={estiloDoRecorte(recortes[foto.id])}
                />
              ) : (
                <Image
                  src={foto.urlMiniatura}
                  alt={`Foto ${i + 1} de ${tituloEvento}`}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>

      <p className="sr-only" role="status">
        {fotos.length} fotos carregadas
      </p>

      {erro && (
        <p className="text-sm text-destructive" role="alert">
          Não foi possível carregar mais fotos. Verifique a conexão e tente de novo.
        </p>
      )}

      {cursor && (
        <Button variant="outline" onClick={carregarMais} disabled={carregando} size="touch">
          {carregando && <Loader2 aria-hidden="true" className="animate-spin" />}
          {carregando ? "Carregando…" : "Carregar mais fotos"}
        </Button>
      )}
    </div>
  );
}
