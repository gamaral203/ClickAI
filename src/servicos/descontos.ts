// Cálculo dos descontos do carrinho e do pedido (docs/arquitetura.md, "Compra e pagamento").
// Função pura: recebe os itens com preço já lido do banco e as regras, e devolve o desconto de
// cada item. A ordem e a combinação ficam só aqui, no servidor (docs/riscos.md: preço alterado
// no navegador; pacote combinado com outros descontos):
//
//   1. Pacote "todas as minhas fotos", se escolhido: substitui o preço das fotos encontradas
//      pela busca e não se combina com nada.
//   2. Desconto progressivo, por evento, só sobre as fotos fora do pacote.
//   3. Cupom, sobre o resultado, só nos itens dos eventos do fotógrafo que criou o cupom.
//
// Vídeos não entram no pacote nem no progressivo; o cupom vale para eles (menos o de fotos
// grátis, que isenta só fotos). Tudo em centavos inteiros. Desconto percentual é arredondado
// para baixo, item a item: o centavo do arredondamento fica com o vendedor. Desconto em valor
// fixo (pacote, cupom em reais) é repartido entre os itens sem perder nem sobrar centavo.

import type { Cupom, FaixaDesconto, Pacote, TipoItem } from "@/dados/tipos";

export type ItemParaDesconto = {
  fotoId: string;
  eventoId: string;
  /** Dono do evento: é quem define as faixas e os cupons que valem para o item. */
  donoEventoId: string;
  tipo: TipoItem;
  precoCentavos: number;
};

/** Pacote escolhido pelo comprador, com as fotos que a busca encontrou (já conferidas). */
export type PacoteEscolhido = { eventoId: string; fotoIds: string[] };

export type EntradaDescontos = {
  itens: ItemParaDesconto[];
  faixas: FaixaDesconto[];
  pacotes: Pacote[];
  escolhidos: PacoteEscolhido[];
  /** Cupom encontrado pelo código digitado; `null` se não digitou ou não existe. */
  cupom: Cupom | null;
  agora: number;
  /** Eventos com o desconto progressivo desligado pelo fotógrafo. */
  semProgressivo?: string[];
};

export type ItemComDesconto = {
  fotoId: string;
  precoCentavos: number;
  descontoCentavos: number;
  viaPacote: boolean;
};

export type LinhaDesconto =
  | { tipo: "pacote"; eventoId: string; quantidade: number; valorCentavos: number }
  | { tipo: "progressivo"; eventoId: string; pct: number; valorCentavos: number }
  | { tipo: "cupom"; codigo: string; valorCentavos: number };

export type MotivoCupomRecusado =
  "inativo" | "fora_do_prazo" | "esgotado" | "sem_itens" | "minimo_valor" | "minimo_quantidade";

export type ResultadoDescontos = {
  itens: ItemComDesconto[];
  linhas: LinhaDesconto[];
  /** Eventos cujo pacote foi pedido mas não vale (expirou, mudou, ou faltam fotos). */
  pacotesRecusados: string[];
  cupom:
    | { situacao: "nenhum" }
    | { situacao: "aplicado"; cupomId: string; codigo: string }
    | { situacao: "recusado"; codigo: string; motivo: MotivoCupomRecusado; minimo?: number };
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
};

/**
 * Reparte `total` entre os pesos, proporcionalmente, sem perder centavo: cada parte é
 * arredondada para baixo e os centavos que sobram vão para os maiores restos (desempate pela
 * ordem). A soma é sempre exatamente `total`.
 */
export function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (soma === 0 || total === 0) return pesos.map(() => 0);
  const partes = pesos.map((p) => Math.floor((total * p) / soma));
  let sobra = total - partes.reduce((s, p) => s + p, 0);
  const ordem = pesos
    .map((p, i) => ({ i, resto: (total * p) % soma }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (sobra === 0) break;
    partes[i]++;
    sobra--;
  }
  return partes;
}

/** Pacote do evento que vale agora, ou `undefined`. */
export function pacoteVigente(pacotes: Pacote[], eventoId: string, agora: number) {
  return pacotes.find(
    (p) =>
      p.eventoId === eventoId &&
      p.ativo &&
      (p.expiraEm === null || new Date(p.expiraEm).getTime() > agora),
  );
}

/** Preço do pacote para `quantidade` fotos, ou `null` se o pacote não é oferecido. */
export function precoDoPacote(pacote: Pacote, quantidade: number) {
  if (quantidade === 0) return null;
  if (pacote.mostrarAPartirDe !== null && quantidade < pacote.mostrarAPartirDe) return null;
  return pacote.tipoPreco === "fixo" ? pacote.precoCentavos : pacote.precoCentavos * quantidade;
}

/**
 * Faixas que valem para o evento: as próprias do evento, se houver; senão a regra padrão do
 * dono do evento. Nunca as duas juntas.
 */
export function faixasDoEvento(faixas: FaixaDesconto[], eventoId: string, donoId: string) {
  const doEvento = faixas.filter((f) => f.eventoId === eventoId);
  if (doEvento.length > 0) return doEvento;
  return faixas.filter((f) => f.eventoId === null && f.fotografoId === donoId);
}

/** Maior percentual cuja quantidade mínima foi atingida, ou 0. */
export function pctProgressivo(faixas: FaixaDesconto[], quantidade: number) {
  return faixas
    .filter((f) => quantidade >= f.quantidadeMin)
    .reduce((maior, f) => Math.max(maior, f.descontoPct), 0);
}

export function calcularDescontos(entrada: EntradaDescontos): ResultadoDescontos {
  const { itens, agora } = entrada;
  const desconto = new Map(itens.map((i) => [i.fotoId, 0]));
  const viaPacote = new Set<string>();
  const linhas: LinhaDesconto[] = [];
  const pacotesRecusados: string[] = [];
  const liquido = (i: ItemParaDesconto) => i.precoCentavos - (desconto.get(i.fotoId) ?? 0);

  // 1. Pacotes. Só fotos, e só se todas as fotos encontradas estiverem no carrinho: o pacote é
  // "todas as minhas fotos", não um preço por atacado para qualquer conjunto.
  for (const escolhido of entrada.escolhidos) {
    const pacote = pacoteVigente(entrada.pacotes, escolhido.eventoId, agora);
    const alvo = new Set(escolhido.fotoIds);
    const doPacote = itens.filter(
      (i) => i.eventoId === escolhido.eventoId && i.tipo === "foto" && alvo.has(i.fotoId),
    );
    const preco = pacote ? precoDoPacote(pacote, doPacote.length) : null;
    const normal = doPacote.reduce((s, i) => s + i.precoCentavos, 0);
    if (preco === null || doPacote.length !== alvo.size || preco >= normal) {
      pacotesRecusados.push(escolhido.eventoId);
      continue;
    }
    const partes = repartir(
      normal - preco,
      doPacote.map((i) => i.precoCentavos),
    );
    doPacote.forEach((item, n) => {
      desconto.set(item.fotoId, partes[n]);
      viaPacote.add(item.fotoId);
    });
    linhas.push({
      tipo: "pacote",
      eventoId: escolhido.eventoId,
      quantidade: doPacote.length,
      valorCentavos: normal - preco,
    });
  }

  // 2. Desconto progressivo, por evento, sobre as fotos fora do pacote.
  const eventos = [...new Set(itens.map((i) => i.eventoId))];
  for (const eventoId of eventos) {
    if (entrada.semProgressivo?.includes(eventoId)) continue;
    const fotos = itens.filter(
      (i) => i.eventoId === eventoId && i.tipo === "foto" && !viaPacote.has(i.fotoId),
    );
    if (fotos.length === 0) continue;
    const pct = pctProgressivo(
      faixasDoEvento(entrada.faixas, eventoId, fotos[0].donoEventoId),
      fotos.length,
    );
    if (pct === 0) continue;
    let total = 0;
    for (const foto of fotos) {
      const valor = Math.floor((foto.precoCentavos * pct) / 100);
      desconto.set(foto.fotoId, valor);
      total += valor;
    }
    if (total > 0) linhas.push({ tipo: "progressivo", eventoId, pct, valorCentavos: total });
  }

  // 3. Cupom.
  const cupom = aplicarCupom(entrada, itens, viaPacote, liquido, desconto, linhas);

  const resultado = itens.map((i) => ({
    fotoId: i.fotoId,
    precoCentavos: i.precoCentavos,
    descontoCentavos: desconto.get(i.fotoId) ?? 0,
    viaPacote: viaPacote.has(i.fotoId),
  }));
  const subtotalCentavos = resultado.reduce((s, i) => s + i.precoCentavos, 0);
  const descontoCentavos = resultado.reduce((s, i) => s + i.descontoCentavos, 0);
  return {
    itens: resultado,
    linhas,
    pacotesRecusados,
    cupom,
    subtotalCentavos,
    descontoCentavos,
    totalCentavos: subtotalCentavos - descontoCentavos,
  };
}

function aplicarCupom(
  entrada: EntradaDescontos,
  itens: ItemParaDesconto[],
  viaPacote: Set<string>,
  liquido: (i: ItemParaDesconto) => number,
  desconto: Map<string, number>,
  linhas: LinhaDesconto[],
): ResultadoDescontos["cupom"] {
  const { cupom, agora } = entrada;
  if (!cupom) return { situacao: "nenhum" };
  const recusar = (motivo: MotivoCupomRecusado, minimo?: number) =>
    ({ situacao: "recusado", codigo: cupom.codigo, motivo, minimo }) as const;

  if (!cupom.ativo) return recusar("inativo");
  const comecou = new Date(cupom.inicioEm).getTime() <= agora;
  const vence = cupom.expiraEm === null || new Date(cupom.expiraEm).getTime() > agora;
  if (!comecou || !vence) return recusar("fora_do_prazo");
  if (cupom.usosMax !== null && cupom.usos >= cupom.usosMax) return recusar("esgotado");

  const eventos = new Set(cupom.eventoIds);
  const elegiveis = itens.filter(
    (i) =>
      !viaPacote.has(i.fotoId) &&
      i.donoEventoId === cupom.fotografoId &&
      (cupom.todosEventos || eventos.has(i.eventoId)) &&
      liquido(i) > 0,
  );
  if (elegiveis.length === 0) return recusar("sem_itens");

  const base = elegiveis.reduce((s, i) => s + liquido(i), 0);
  if (cupom.minimoTipo === "valor" && base < cupom.minimoValor) {
    return recusar("minimo_valor", cupom.minimoValor);
  }
  if (cupom.minimoTipo === "quantidade" && elegiveis.length < cupom.minimoValor) {
    return recusar("minimo_quantidade", cupom.minimoValor);
  }

  let partes: number[];
  if (cupom.tipo === "percentual") {
    const pct = Math.min(100, Math.max(0, cupom.valor));
    partes = elegiveis.map((i) => Math.floor((liquido(i) * pct) / 100));
  } else if (cupom.tipo === "valor") {
    partes = repartir(
      Math.min(Math.max(0, cupom.valor), base),
      elegiveis.map((i) => liquido(i)),
    );
  } else {
    // Fotos grátis: isenta as fotos de menor preço (depois do progressivo). Vídeos não entram.
    const gratis = new Set(
      elegiveis
        .filter((i) => i.tipo === "foto")
        .sort((a, b) => liquido(a) - liquido(b) || a.fotoId.localeCompare(b.fotoId))
        .slice(0, Math.max(0, cupom.valor))
        .map((i) => i.fotoId),
    );
    partes = elegiveis.map((i) => (gratis.has(i.fotoId) ? liquido(i) : 0));
  }

  const total = partes.reduce((s, p) => s + p, 0);
  if (total === 0) return recusar("sem_itens");
  elegiveis.forEach((item, n) => {
    desconto.set(item.fotoId, (desconto.get(item.fotoId) ?? 0) + partes[n]);
  });
  linhas.push({ tipo: "cupom", codigo: cupom.codigo, valorCentavos: total });
  return { situacao: "aplicado", cupomId: cupom.id, codigo: cupom.codigo };
}
