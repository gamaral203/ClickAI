"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { trocarFotoAtual, veioDaGaleria } from "@/lib/volta-da-galeria";

/** Clique comum (sem Ctrl/Cmd/Shift nem botão do meio, que abrem em outra aba ou janela). */
function cliqueSimples(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * "Voltar para o evento": quem veio da galeria nesta aba e ainda está numa foto daquela tela
 * volta no histórico, para a mesma página e o mesmo ponto da galeria (igual ao voltar do
 * navegador ou ao gesto do celular). Quem abriu o link da foto direto, ou passou para uma foto
 * de outra página, vai pelo link (`href`) para a página da galeria em que a foto está, com a
 * âncora da foto (o navegador rola até ela, mesmo sem JavaScript).
 */
export function VoltarParaGaleria({
  slug,
  fotoId,
  href,
  className,
  children,
}: {
  slug: string;
  fotoId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // Pelo link, a âncora `#foto-<id>` do endereço leva até a foto na grade.
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
 * navegador ou do gesto) levar de volta à galeria e não foto por foto. Atravessa o limite da
 * página da galeria normalmente (a ordem é a da galeria inteira).
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
