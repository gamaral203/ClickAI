import "server-only";

import {
  buscarCupomPorCodigo,
  buscarItensParaCompra,
  buscarRegrasDeDesconto,
  type ItemParaCompra,
} from "@/dados";
import { formatarPreco } from "@/lib/formatar";

import { calcularDescontos, type ResultadoDescontos } from "./descontos";
import { lerPacotesEscolhidos } from "./pacotes";

// Cálculo do carrinho no servidor, sempre a partir dos dados (docs/riscos.md: preço alterado
// no navegador, prioridade alta). O navegador manda só ids, os tokens dos pacotes e o código
// do cupom; preços, descontos e totais saem daqui. O pedido usa o mesmo cálculo.

export type OpcoesCompra = {
  /** Tokens dos pacotes escolhidos, como a busca entregou. */
  pacotes?: string[];
  /** Código do cupom digitado. */
  cupom?: string | null;
};

export type ItemCarrinho = {
  fotoId: string;
  tipo: "foto" | "video";
  urlMiniatura: string;
  largura: number;
  altura: number;
  precoCentavos: number;
  descontoCentavos: number;
  viaPacote: boolean;
};

export type GrupoCarrinho = {
  eventoId: string;
  eventoTitulo: string;
  eventoSlug: string;
  itens: ItemCarrinho[];
  subtotalCentavos: number;
};

export type LinhaResumo = { rotulo: string; valorCentavos: number };

export type SituacaoCupom =
  | { situacao: "nenhum" }
  | { situacao: "aplicado"; codigo: string }
  | { situacao: "recusado"; codigo: string; mensagem: string };

export type ResumoCarrinho = {
  grupos: GrupoCarrinho[];
  /** Ids que estavam no carrinho mas não estão mais à venda. */
  indisponiveis: string[];
  /**
   * Eventos cujo pacote valeu neste cálculo. O navegador descarta os outros tokens: vencidos,
   * alterados ou com fotos que saíram do carrinho.
   */
  pacotesAplicados: string[];
  descontos: LinhaResumo[];
  cupom: SituacaoCupom;
  quantidade: number;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
};

/** Resultado completo, com o que o pedido precisa gravar. */
export type CalculoCompra = {
  itens: ItemParaCompra[];
  descontos: ResultadoDescontos;
  indisponiveis: string[];
};

export async function calcularCompra(
  ids: string[],
  opcoes: OpcoesCompra = {},
): Promise<CalculoCompra> {
  const itens = await buscarItensParaCompra(ids);
  const encontrados = new Set(itens.map((i) => i.foto.id));
  // Mantém a ordem em que a pessoa adicionou os itens.
  const ordenados = ids.flatMap((id) => itens.filter((i) => i.foto.id === id));
  const eventoIds = [...new Set(ordenados.map((i) => i.evento.id))];
  const codigo = opcoes.cupom?.trim();
  const [regras, cupom] = await Promise.all([
    buscarRegrasDeDesconto(eventoIds),
    codigo ? buscarCupomPorCodigo(codigo) : null,
  ]);
  const descontos = calcularDescontos({
    itens: ordenados.map((i) => ({
      fotoId: i.foto.id,
      eventoId: i.evento.id,
      donoEventoId: i.evento.fotografoId,
      tipo: i.foto.tipo,
      precoCentavos: i.precoCentavos,
    })),
    faixas: regras.faixas,
    pacotes: regras.pacotes,
    escolhidos: lerPacotesEscolhidos(opcoes.pacotes ?? []),
    cupom,
    agora: Date.now(),
  });
  // Código que não existe: recusado com a mesma mensagem de "não vale para estes itens", para
  // não servir de teste de quais códigos existem.
  if (codigo && !cupom) {
    descontos.cupom = { situacao: "recusado", codigo, motivo: "sem_itens" };
  }
  return { itens: ordenados, descontos, indisponiveis: ids.filter((id) => !encontrados.has(id)) };
}

/** Texto para o comprador quando o cupom não vale. */
export function mensagemCupom(cupom: ResultadoDescontos["cupom"]): string | null {
  if (cupom.situacao !== "recusado") return null;
  switch (cupom.motivo) {
    case "inativo":
    case "fora_do_prazo":
      return "Este cupom não está valendo agora.";
    case "esgotado":
      return "Este cupom já atingiu o limite de usos.";
    case "minimo_valor":
      return `Este cupom vale para compras a partir de ${formatarPreco(cupom.minimo ?? 0)} com o fotógrafo.`;
    case "minimo_quantidade":
      return `Este cupom vale a partir de ${cupom.minimo} itens do fotógrafo.`;
    case "sem_itens":
      return "Cupom inválido ou que não vale para os itens do carrinho.";
  }
}

export async function calcularCarrinho(
  ids: string[],
  opcoes: OpcoesCompra = {},
): Promise<ResumoCarrinho> {
  const { itens, descontos, indisponiveis } = await calcularCompra(ids, opcoes);
  const porFoto = new Map(descontos.itens.map((i) => [i.fotoId, i]));
  const titulos = new Map(itens.map((i) => [i.evento.id, i.evento.titulo]));

  const grupos = new Map<string, GrupoCarrinho>();
  for (const item of itens) {
    const calculado = porFoto.get(item.foto.id);
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
      descontoCentavos: calculado?.descontoCentavos ?? 0,
      viaPacote: calculado?.viaPacote ?? false,
    });
    grupo.subtotalCentavos += item.precoCentavos;
    grupos.set(item.evento.id, grupo);
  }

  const evento = (id: string) => titulos.get(id) ?? "evento";
  const linhas: LinhaResumo[] = descontos.linhas.map((l) => {
    if (l.tipo === "pacote") {
      return {
        rotulo: `Pacote com ${l.quantidade} fotos (${evento(l.eventoId)})`,
        valorCentavos: l.valorCentavos,
      };
    }
    if (l.tipo === "progressivo") {
      return {
        rotulo: `${l.pct}% por quantidade (${evento(l.eventoId)})`,
        valorCentavos: l.valorCentavos,
      };
    }
    return { rotulo: `Cupom ${l.codigo}`, valorCentavos: l.valorCentavos };
  });

  const c = descontos.cupom;
  const cupom: SituacaoCupom =
    c.situacao === "nenhum"
      ? c
      : c.situacao === "aplicado"
        ? { situacao: "aplicado", codigo: c.codigo }
        : { situacao: "recusado", codigo: c.codigo, mensagem: mensagemCupom(c) ?? "" };

  return {
    grupos: [...grupos.values()],
    indisponiveis,
    pacotesAplicados: descontos.linhas.flatMap((l) => (l.tipo === "pacote" ? [l.eventoId] : [])),
    descontos: linhas,
    cupom,
    quantidade: itens.length,
    subtotalCentavos: descontos.subtotalCentavos,
    descontoCentavos: descontos.descontoCentavos,
    totalCentavos: descontos.totalCentavos,
  };
}
