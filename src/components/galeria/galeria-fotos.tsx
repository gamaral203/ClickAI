"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import { Paginacao } from "@/components/galeria/paginacao";
import type { FiltroGaleria } from "@/dados";
import type { Foto } from "@/dados/tipos";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";
import { fotoParaRolar, guardarOrigem } from "@/lib/volta-da-galeria";

type Props = {
  slug: string;
  tituloEvento: string;
  /** Fotos na tela: a página da galeria ou o resultado da busca. */
  fotos: Foto[];
  /**
   * Galeria principal do evento: página atual, total e o filtro (que entra nos links das
   * páginas). Sem ela (resultado da busca), mostra todas as fotos recebidas, sem páginas.
   */
  paginacao?: { pagina: number; totalPaginas: number; total: number; filtro: FiltroGaleria };
  /** Texto quando não há fotos. */
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

const numero = new Intl.NumberFormat("pt-BR");

export function GaleriaFotos({
  slug,
  tituloEvento,
  fotos,
  paginacao,
  vazio = VAZIO_PADRAO,
  recortes,
}: Props) {
  const ids = fotos.map((f) => f.id);
  const chaveDosIds = ids.join();

  // Volta da página da foto: rola até a foto que estava aberta, se ela está nesta tela. A página
  // em si vem da URL (`?pagina=N`). Pelo histórico, a foto vem do sessionStorage; pelo link, da
  // âncora `#foto-<id>` (a galeria chega depois do esqueleto do Suspense, então a rolagem da
  // âncora feita pelo Next não acharia a foto).
  useEffect(() => {
    const naTela = chaveDosIds.split(",");
    const daAncora = /^#foto-([0-9a-f-]{36})$/.exec(window.location.hash)?.[1];
    const alvo =
      fotoParaRolar(slug, naTela) ?? (daAncora && naTela.includes(daAncora) ? daAncora : null);
    if (!alvo) return;
    const quadro = requestAnimationFrame(() => {
      document
        .querySelector(`[data-foto="${CSS.escape(alvo)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => cancelAnimationFrame(quadro);
  }, [slug, chaveDosIds]);

  function aoAbrirFoto(fotoId: string) {
    guardarOrigem({ slug, fotoAtual: fotoId, ids });
  }

  if (fotos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">{vazio.titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{vazio.detalhe}</p>
      </div>
    );
  }

  // Posição da primeira foto na lista inteira, para o "Foto N" do texto alternativo.
  const deslocamento = paginacao ? (paginacao.pagina - 1) * FOTOS_POR_PAGINA : 0;
  const paginas = paginacao && paginacao.totalPaginas > 1 ? paginacao : null;

  return (
    <div className="flex flex-col items-center gap-6">
      {paginas && (
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums" role="status">
            Fotos {numero.format(deslocamento + 1)} a {numero.format(deslocamento + fotos.length)}{" "}
            de {numero.format(paginas.total)}
          </p>
          <div className="sm:w-auto">
            <Paginacao
              slug={slug}
              filtro={paginas.filtro}
              pagina={paginas.pagina}
              totalPaginas={paginas.totalPaginas}
              rotulo="Páginas (topo da galeria)"
            />
          </div>
        </div>
      )}

      <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {fotos.map((foto, i) => (
          <li key={foto.id} id={`foto-${foto.id}`} data-foto={foto.id} className="scroll-mt-4">
            <Link
              onContextMenu={(e) => e.preventDefault()}
              href={`/fotos/${foto.id}`}
              onClick={() => aoAbrirFoto(foto.id)}
              className="group relative block aspect-square overflow-hidden rounded-lg bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {recortes?.[foto.id] ? (
                // Ampliada no rosto: usa a prévia (maior) para não pixelar com o zoom.
                <Image
                  src={foto.urlPrevia}
                  alt={`Foto ${deslocamento + i + 1} de ${tituloEvento}, ampliada no seu rosto`}
                  fill
                  draggable={false}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover imagem-protegida"
                  style={estiloDoRecorte(recortes[foto.id])}
                />
              ) : (
                <Image
                  src={foto.urlMiniatura}
                  alt={`Foto ${deslocamento + i + 1} de ${tituloEvento}`}
                  fill
                  draggable={false}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover transition-transform duration-200 imagem-protegida group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>

      {paginas && (
        <Paginacao
          slug={slug}
          filtro={paginas.filtro}
          pagina={paginas.pagina}
          totalPaginas={paginas.totalPaginas}
        />
      )}
    </div>
  );
}
