"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { carregarMaisFotos } from "@/app/(publico)/eventos/[slug]/acoes";
import { Button } from "@/components/ui/button";
import type { Foto, PaginaDeFotos } from "@/dados/tipos";

type Props = {
  slug: string;
  tituloEvento: string;
  paginaInicial: PaginaDeFotos;
};

export function GaleriaFotos({ slug, tituloEvento, paginaInicial }: Props) {
  const [fotos, setFotos] = useState<Foto[]>(paginaInicial.fotos);
  const [cursor, setCursor] = useState(paginaInicial.proximoCursor);
  const [erro, setErro] = useState(false);
  const [carregando, startTransition] = useTransition();

  function carregarMais() {
    if (!cursor) return;
    setErro(false);
    startTransition(async () => {
      try {
        const pagina = await carregarMaisFotos(slug, cursor);
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
        <p className="font-medium">Ainda não há fotos neste evento.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          O fotógrafo pode estar enviando agora. Volte daqui a pouco.
        </p>
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
              <Image
                src={foto.urlMiniatura}
                alt={`Foto ${i + 1} de ${tituloEvento}`}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
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
