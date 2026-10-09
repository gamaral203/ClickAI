import { describe, expect, it } from "vitest";

import type { Cupom, FaixaDesconto, Pacote } from "@/dados/tipos";

import {
  calcularDescontos,
  repartir,
  type EntradaDescontos,
  type ItemParaDesconto,
} from "./descontos";

const agora = Date.UTC(2026, 9, 7, 12);
const LIA = "lia";
const PEDRO = "pedro";

function foto(n: number, preco = 1000, eventoId = "ev1", dono = LIA): ItemParaDesconto {
  return { fotoId: `f${n}`, eventoId, donoEventoId: dono, tipo: "foto", precoCentavos: preco };
}
function video(n: number, preco = 3000, eventoId = "ev1", dono = LIA): ItemParaDesconto {
  return { ...foto(n, preco, eventoId, dono), fotoId: `v${n}`, tipo: "video" };
}

function faixa(quantidadeMin: number, descontoPct: number, eventoId: string | null = null) {
  return {
    id: `fx-${quantidadeMin}-${eventoId}`,
    fotografoId: LIA,
    eventoId,
    quantidadeMin,
    descontoPct,
  } satisfies FaixaDesconto;
}

const pacoteFixo: Pacote = {
  id: "p1",
  eventoId: "ev1",
  tipoPreco: "fixo",
  precoCentavos: 2500,
  mostrarAPartirDe: 3,
  expiraEm: null,
  ativo: true,
};

function cupom(parcial: Partial<Cupom>): Cupom {
  return {
    id: "c1",
    fotografoId: LIA,
    codigo: "TESTE",
    tipo: "percentual",
    valor: 10,
    usosMax: null,
    usos: 0,
    inicioEm: "2026-01-01T00:00:00Z",
    expiraEm: null,
    minimoTipo: "nenhum",
    minimoValor: 0,
    todosEventos: true,
    eventoIds: [],
    ativo: true,
    ...parcial,
  };
}

function calcular(parcial: Partial<EntradaDescontos>) {
  return calcularDescontos({
    itens: [],
    faixas: [],
    pacotes: [],
    escolhidos: [],
    cupom: null,
    agora,
    ...parcial,
  });
}

const descontoDe = (r: ReturnType<typeof calcular>, id: string) =>
  r.itens.find((i) => i.fotoId === id)?.descontoCentavos;

describe("repartir", () => {
  it("fecha a soma exata e dá os centavos aos maiores restos", () => {
    expect(repartir(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartir(10, [3, 7])).toEqual([3, 7]);
    expect(repartir(0, [5, 5])).toEqual([0, 0]);
    for (let total = 0; total < 500; total += 7) {
      const partes = repartir(total, [1990, 2990, 1490, 10]);
      expect(partes.reduce((s, p) => s + p, 0)).toBe(total);
    }
  });
});

describe("sem regras", () => {
  it("não dá desconto", () => {
    const r = calcular({ itens: [foto(1), video(1)] });
    expect(r).toMatchObject({ subtotalCentavos: 4000, descontoCentavos: 0, totalCentavos: 4000 });
    expect(r.linhas).toEqual([]);
  });
});

describe("desconto progressivo", () => {
  it("não vale no evento em que o fotógrafo desligou", () => {
    const itens = [foto(1), foto(2), foto(3, 1000, "ev2"), foto(4, 1000, "ev2")];
    const r = calcular({ itens, faixas: [faixa(2, 10)], semProgressivo: ["ev1"] });
    expect(descontoDe(r, "f1")).toBe(0);
    expect(descontoDe(r, "f3")).toBe(100);
    expect(r.linhas).toEqual([
      { tipo: "progressivo", eventoId: "ev2", pct: 10, valorCentavos: 200 },
    ]);
  });

  it("usa a maior faixa atingida e só vale para fotos", () => {
    const r = calcular({
      itens: [foto(1), foto(2), foto(3), video(1)],
      faixas: [faixa(2, 10), faixa(3, 20)],
    });
    expect(descontoDe(r, "f1")).toBe(200);
    expect(descontoDe(r, "v1")).toBe(0);
    expect(r.descontoCentavos).toBe(600);
    expect(r.linhas).toEqual([
      { tipo: "progressivo", eventoId: "ev1", pct: 20, valorCentavos: 600 },
    ]);
  });

  it("faixas do evento substituem a regra padrão do fotógrafo", () => {
    const r = calcular({
      itens: [foto(1), foto(2)],
      faixas: [faixa(2, 50), faixa(2, 10, "ev1")],
    });
    expect(r.descontoCentavos).toBe(200);
  });

  it("conta as fotos de cada evento separadas", () => {
    const r = calcular({
      itens: [foto(1, 1000, "ev1"), foto(2, 1000, "ev2")],
      faixas: [faixa(2, 10)],
    });
    expect(r.descontoCentavos).toBe(0);
  });

  it("não usa a regra padrão de outro fotógrafo", () => {
    const r = calcular({
      itens: [foto(1, 1000, "ev9", PEDRO), foto(2, 1000, "ev9", PEDRO)],
      faixas: [faixa(2, 10)],
    });
    expect(r.descontoCentavos).toBe(0);
  });

  it("arredonda para baixo, item a item", () => {
    const r = calcular({ itens: [foto(1, 1999), foto(2, 1999)], faixas: [faixa(2, 10)] });
    expect(descontoDe(r, "f1")).toBe(199);
  });
});

describe("pacote", () => {
  const itens = [foto(1), foto(2), foto(3), foto(4)];

  it("substitui o preço das fotos encontradas e não se combina com progressivo nem cupom", () => {
    const r = calcular({
      itens,
      faixas: [faixa(2, 10)],
      pacotes: [pacoteFixo],
      escolhidos: [{ eventoId: "ev1", fotoIds: ["f1", "f2", "f3"] }],
      cupom: cupom({ tipo: "percentual", valor: 50 }),
    });
    // Pacote: 3 fotos de 10,00 por 25,00. A f4, fora do pacote, sozinha: sem progressivo;
    // o cupom vale só para ela.
    const doPacote = ["f1", "f2", "f3"].map((id) => descontoDe(r, id) ?? 0);
    expect(doPacote.reduce((s, d) => s + d, 0)).toBe(500);
    expect(r.itens.filter((i) => i.viaPacote).map((i) => i.fotoId)).toEqual(["f1", "f2", "f3"]);
    expect(descontoDe(r, "f4")).toBe(500);
    expect(r.totalCentavos).toBe(2500 + 500);
  });

  it("preço por foto multiplica pela quantidade", () => {
    const r = calcular({
      itens: itens.slice(0, 3),
      pacotes: [{ ...pacoteFixo, tipoPreco: "por_foto", precoCentavos: 700 }],
      escolhidos: [{ eventoId: "ev1", fotoIds: ["f1", "f2", "f3"] }],
    });
    expect(r.totalCentavos).toBe(2100);
  });

  it("recusa se faltar foto encontrada no carrinho, abaixo do mínimo, vencido ou mais caro", () => {
    const base = { itens, pacotes: [pacoteFixo] };
    const faltando = calcular({
      ...base,
      escolhidos: [{ eventoId: "ev1", fotoIds: ["f1", "f2", "f3", "f9"] }],
    });
    const poucas = calcular({ ...base, escolhidos: [{ eventoId: "ev1", fotoIds: ["f1", "f2"] }] });
    const vencido = calcular({
      itens,
      pacotes: [{ ...pacoteFixo, expiraEm: "2026-01-01T00:00:00Z" }],
      escolhidos: [{ eventoId: "ev1", fotoIds: ["f1", "f2", "f3"] }],
    });
    const caro = calcular({
      itens,
      pacotes: [{ ...pacoteFixo, precoCentavos: 5000 }],
      escolhidos: [{ eventoId: "ev1", fotoIds: ["f1", "f2", "f3"] }],
    });
    for (const r of [faltando, poucas, vencido, caro]) {
      expect(r.pacotesRecusados).toEqual(["ev1"]);
      expect(r.descontoCentavos).toBe(0);
    }
  });

  it("não inclui vídeos", () => {
    const r = calcular({
      itens: [foto(1), foto(2), foto(3), video(1)],
      pacotes: [pacoteFixo],
      escolhidos: [{ eventoId: "ev1", fotoIds: ["f1", "f2", "f3", "v1"] }],
    });
    expect(r.pacotesRecusados).toEqual(["ev1"]);
  });
});

describe("cupom", () => {
  it("percentual sobre o resultado do progressivo", () => {
    const r = calcular({
      itens: [foto(1), foto(2)],
      faixas: [faixa(2, 10)],
      cupom: cupom({ tipo: "percentual", valor: 10 }),
    });
    // 1000 → 900 (progressivo) → 810 (cupom)
    expect(descontoDe(r, "f1")).toBe(190);
    expect(r.cupom).toEqual({ situacao: "aplicado", cupomId: "c1", codigo: "TESTE" });
  });

  it("em valor, limitado ao total elegível e repartido sem perder centavo", () => {
    const r = calcular({
      itens: [foto(1, 1000), foto(2, 2000)],
      cupom: cupom({ tipo: "valor", valor: 1000 }),
    });
    expect(descontoDe(r, "f1")).toBe(333);
    expect(descontoDe(r, "f2")).toBe(667);
    const maior = calcular({ itens: [foto(1, 500)], cupom: cupom({ tipo: "valor", valor: 1000 }) });
    expect(maior.totalCentavos).toBe(0);
  });

  it("fotos grátis isenta as mais baratas e não vale para vídeo", () => {
    const r = calcular({
      itens: [foto(1, 3000), foto(2, 1000), video(1, 500)],
      cupom: cupom({ tipo: "fotos_gratis", valor: 1 }),
    });
    expect(descontoDe(r, "f2")).toBe(1000);
    expect(descontoDe(r, "f1")).toBe(0);
    expect(descontoDe(r, "v1")).toBe(0);
  });

  it("vale para vídeo nos outros tipos", () => {
    const r = calcular({ itens: [video(1, 3000)], cupom: cupom({ valor: 10 }) });
    expect(r.descontoCentavos).toBe(300);
  });

  it("só nos eventos do fotógrafo que criou o cupom e nos eventos escolhidos", () => {
    const r = calcular({
      itens: [foto(1, 1000, "ev1"), foto(2, 1000, "ev2"), foto(3, 1000, "ev9", PEDRO)],
      cupom: cupom({ valor: 50, todosEventos: false, eventoIds: ["ev2"] }),
    });
    expect(descontoDe(r, "f1")).toBe(0);
    expect(descontoDe(r, "f2")).toBe(500);
    expect(descontoDe(r, "f3")).toBe(0);
  });

  it.each([
    ["inativo", { ativo: false }, "inativo"],
    ["vencido", { expiraEm: "2026-03-31T00:00:00Z" }, "fora_do_prazo"],
    ["ainda não começou", { inicioEm: "2026-12-01T00:00:00Z" }, "fora_do_prazo"],
    ["esgotado", { usosMax: 100, usos: 100 }, "esgotado"],
    ["de outro fotógrafo", { fotografoId: PEDRO }, "sem_itens"],
    ["abaixo do valor mínimo", { minimoTipo: "valor", minimoValor: 5000 }, "minimo_valor"],
    [
      "abaixo da quantidade mínima",
      { minimoTipo: "quantidade", minimoValor: 3 },
      "minimo_quantidade",
    ],
  ] as const)("recusa cupom %s", (_, parcial, motivo) => {
    const r = calcular({ itens: [foto(1), foto(2)], cupom: cupom(parcial) });
    expect(r.cupom).toMatchObject({ situacao: "recusado", motivo });
    expect(r.descontoCentavos).toBe(0);
  });

  it("nunca deixa item com preço negativo", () => {
    const r = calcular({
      itens: [foto(1), foto(2)],
      faixas: [faixa(2, 60)],
      cupom: cupom({ tipo: "percentual", valor: 100 }),
    });
    expect(r.totalCentavos).toBe(0);
    for (const item of r.itens)
      expect(item.descontoCentavos).toBeLessThanOrEqual(item.precoCentavos);
  });
});
