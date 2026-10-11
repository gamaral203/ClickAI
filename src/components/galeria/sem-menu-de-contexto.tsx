"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Bloco que não abre o menu de contexto (botão direito, "Salvar imagem como...") sobre a prévia.
 * Proteção leve, só contra o caso casual: a marca d'água nos pixels é a proteção real.
 */
export function SemMenuDeContexto({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={style} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}
