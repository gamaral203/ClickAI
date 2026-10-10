// Taxa do cartão do Mercado Pago, dividida meio a meio entre o comprador e o fotógrafo: a
// plataforma não paga nada dela. Pix não tem acréscimo.
//
// O Mercado Pago cobra a taxa sobre o total pago, inclusive sobre o acréscimo. Para a conta fechar
// sem a plataforma pôr dinheiro, com p = taxa e I = valor das fotos:
//   - o comprador paga um acréscimo A = I × p / (2 × (1 − p));
//   - o fotógrafo deixa I × p / 2 da parte dele;
//   - A + I×p/2 = p × (I + A), que é exatamente o que o Mercado Pago desconta.
// Com 4,98%: acréscimo de ~2,62% para o comprador e 2,49% sai da parte do fotógrafo. Os
// arredondamentos são para cima, então a plataforma nunca fica com centavo a menos.
//
// Sem dependências: roda no servidor e no navegador (o checkout mostra o acréscimo).

/** Taxa do cartão à vista do Mercado Pago, em %. Ajustável por MP_TAXA_CARTAO_PCT. */
export const TAXA_CARTAO_PADRAO_PCT = 4.98;

export function taxaCartaoPct(valor = process.env.MP_TAXA_CARTAO_PCT): number {
  const pct = Number(valor);
  return Number.isFinite(pct) && pct > 0 && pct < 20 ? pct : TAXA_CARTAO_PADRAO_PCT;
}

/** Acréscimo que o comprador paga no cartão sobre o valor das fotos, em centavos. */
export function acrescimoCartao(itensCentavos: number, pct: number): number {
  if (itensCentavos <= 0) return 0;
  const p = pct / 100;
  return Math.ceil((itensCentavos * p) / (2 * (1 - p)));
}

/** Parte da taxa do cartão que sai do valor de um lançamento do fotógrafo, em centavos. */
export function parteDoVendedorNaTaxa(valorCentavos: number, pct: number): number {
  if (valorCentavos <= 0) return 0;
  return Math.ceil((valorCentavos * pct) / 200);
}

/** O acréscimo em % sobre o valor das fotos, para mostrar ("2,62%"). */
export function acrescimoCartaoPct(pct: number): number {
  const p = pct / 100;
  return (p / (2 * (1 - p))) * 100;
}
