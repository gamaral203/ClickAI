import "server-only";

import { buscarItensParaCompra } from "@/dados";

// Cálculo do carrinho no servidor, sempre a partir dos dados (docs/riscos.md: preço alterado
// no navegador, prioridade alta). O navegador manda só ids.
// Descontos (pacote, progressivo e cupom) entram aqui na Fase 8, na ordem da arquitetura.

export type ItemCarrinho = {
  fotoId: string;
  tipo: "foto" | "video";
  urlMiniatura: string;
  largura: number;
  altura: number;
  precoCentavos: number;
};

export type GrupoCarrinho = {
  eventoId: string;
  eventoTitulo: string;
  eventoSlug: string;
  itens: ItemCarrinho[];
  subtotalCentavos: number;
};

export type ResumoCarrinho = {
  grupos: GrupoCarrinho[];
  /** Ids que estavam no carrinho mas não estão mais à venda. */
  indisponiveis: string[];
  quantidade: number;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
};

export async function calcularCarrinho(ids: string[]): Promise<ResumoCarrinho> {
  const itens = await buscarItensParaCompra(ids);
  const encontrados = new Set(itens.map((i) => i.foto.id));

  const grupos = new Map<string, GrupoCarrinho>();
  // Mantém a ordem em que a pessoa adicionou os itens.
  for (const id of ids) {
    const item = itens.find((i) => i.foto.id === id);
    if (!item) continue;
    const grupo = grupos.get(item.evento.id) ?? {
      eventoId: item.evento.id,
      eventoTitulo: item.evento.titulo,
      eventoSlug: item.evento.slug,
      itens: [],
      subtotalCentavos: 0,
    };
    grupo.itens.push({
      fotoId: item.foto.id,
      tipo: item.foto.tipo,
      urlMiniatura: item.foto.urlMiniatura,
      largura: item.foto.largura,
      altura: item.foto.altura,
      precoCentavos: item.precoCentavos,
    });
    grupo.subtotalCentavos += item.precoCentavos;
    grupos.set(item.evento.id, grupo);
  }

  const subtotalCentavos = itens.reduce((soma, i) => soma + i.precoCentavos, 0);
  const descontoCentavos = 0;
  return {
    grupos: [...grupos.values()],
    indisponiveis: ids.filter((id) => !encontrados.has(id)),
    quantidade: itens.length,
    subtotalCentavos,
    descontoCentavos,
    totalCentavos: subtotalCentavos - descontoCentavos,
  };
}
