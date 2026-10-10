"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { trocarFotoAtual, veioDaGaleria } from "@/lib/volta-da-galeria";

/** Clique comum (sem Ctrl/Cmd/Shift nem botão do meio, que abrem em outra aba ou janela). */
function cliqueSimples(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * "Voltar para o evento": quem veio da galeria nesta aba volta no histórico, para o mesmo ponto
 * da galeria (igual ao voltar do navegador ou ao gesto do celular). Quem abriu o link da foto
 * direto vai para a galeria do evento pelo link.
 */
export function VoltarParaGaleria({
  slug,
  fotoId,
  className,
  children,
}: {
  slug: string;
  fotoId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={`/eventos/${slug}`}
      className={className}
      onClick={(e) => {
        if (!cliqueSimples(e) || !veioDaGaleria(slug, fotoId)) return;
        e.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}

/**
 * "Anterior"/"Próxima": troca a foto sem empilhar no histórico, para o voltar (do botão, do
 * navegador ou do gesto) levar de volta à galeria e não foto por foto.
 */
export function LinkOutraFoto({
  slug,
  de,
  para,
  className,
  children,
}: {
  slug: string;
  de: string;
  para: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/fotos/${para}`}
      replace
      className={className}
      onClick={(e) => {
        if (cliqueSimples(e)) trocarFotoAtual(slug, de, para);
      }}
    >
      {children}
    </Link>
  );
}
