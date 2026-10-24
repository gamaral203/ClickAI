import type { FiltroFotosDaGestao } from "@/dados";

// Seleção do download de originais da gestão (/admin/eventos/[id];
// src/components/admin/originais-da-gestao.tsx). Só organiza o que o navegador pede: o servidor
// confere tudo de novo a cada lote (papel de gestor, evento, liberação, limite, auditoria) e só
// devolve ids do próprio evento (src/servicos/originais-da-gestao.ts).

export type AlvoDoDownload = "selecionadas" | "filtro" | "evento";

/**
 * Filtro que vai ao servidor para cada alvo. "Todas do filtro" leva o filtro da tela; o evento
 * inteiro e as selecionadas levam só "mostrar excluídas". As selecionadas não precisam do filtro
 * de pasta ou autor (os ids já dizem quais são) e podem vir de fora dele: as fotos achadas pela
 * busca por selfie são do evento todo, em qualquer pasta.
 */
export function filtroDoAlvo(
  alvo: AlvoDoDownload,
  filtro: FiltroFotosDaGestao,
): FiltroFotosDaGestao {
  return alvo === "filtro" ? filtro : { excluidas: Boolean(filtro.excluidas) };
}

type Ouvinte = (fotoIds: string[]) => void;
const ouvintes = new Set<Ouvinte>();

/**
 * Pede ao quadro "Baixar originais (gestão)" desta página que selecione estas fotos (as
 * encontradas pela busca por selfie). Sem o quadro na tela, nada acontece.
 */
export function selecionarParaBaixar(fotoIds: string[]) {
  const unicos = [...new Set(fotoIds)];
  for (const ouvinte of ouvintes) ouvinte(unicos);
}

/** O quadro de download passa a ouvir os pedidos de seleção; devolve a função que para. */
export function ouvirSelecaoParaBaixar(ouvinte: Ouvinte) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
