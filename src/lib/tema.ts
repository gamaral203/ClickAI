// Modo dia e modo noturno. O padrão é o dia; o noturno só quando a pessoa escolhe no botão
// (src/components/site/botao-tema.tsx). Não segue a preferência do sistema de propósito.

export type Tema = "claro" | "escuro";

export const COOKIE_TEMA = "tema";

export function temaDoCookie(valor: string | undefined): Tema {
  return valor === "escuro" ? "escuro" : "claro";
}

/** Só o painel do fotógrafo e a gestão têm modo noturno; o site de compra é sempre dia. */
export function caminhoTemTemaNoturno(caminho: string | null | undefined) {
  const primeiro = (caminho ?? "").split("/")[1];
  return primeiro === "painel" || primeiro === "admin";
}
