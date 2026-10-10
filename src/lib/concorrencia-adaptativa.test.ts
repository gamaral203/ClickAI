import { describe, expect, it } from "vitest";

import { Orcamento } from "@/lib/concorrencia";
import { AjusteDeConcorrencia, faixaDeConcorrencia, Vagas } from "@/lib/concorrencia-adaptativa";

const MB = 1024 * 1024;

describe("concorrência adaptativa do envio", () => {
  it("faixa maior para arquivos pequenos", () => {
    expect(faixaDeConcorrencia(2 * MB)).toEqual({ minimo: 6, maximo: 16, inicial: 10 });
    expect(faixaDeConcorrencia(25 * MB)).toEqual({ minimo: 4, maximo: 10, inicial: 6 });
  });

  it("sobe enquanto a vazão melhora e volta quando piora", () => {
    const ajuste = new AjusteDeConcorrencia({ minimo: 4, maximo: 10, inicial: 6 });
    expect(ajuste.registrar(10 * MB, true)).toBe(7);
    expect(ajuste.registrar(12 * MB, true)).toBe(8);
    expect(ajuste.registrar(14 * MB, true)).toBe(9);
    // Piorou: volta um degrau e passa a descer.
    expect(ajuste.registrar(11 * MB, true)).toBe(8);
    // Melhorou descendo: continua descendo.
    expect(ajuste.registrar(13 * MB, true)).toBe(7);
  });

  it("respeita a faixa e não mexe quando a concorrência não é o gargalo", () => {
    const ajuste = new AjusteDeConcorrencia({ minimo: 4, maximo: 6, inicial: 6 });
    expect(ajuste.registrar(10 * MB, true)).toBe(6);
    expect(ajuste.registrar(20 * MB, true)).toBe(6);
    // Sem envio esperando vaga: fica como está.
    expect(ajuste.registrar(1 * MB, false)).toBe(6);
    for (let i = 0; i < 10; i++) ajuste.registrar(i % 2 ? 1 * MB : 10 * MB, true);
    expect(ajuste.atual).toBeGreaterThanOrEqual(4);
    expect(ajuste.atual).toBeLessThanOrEqual(6);
  });

  it("estável por algumas janelas: testa um degrau acima", () => {
    const ajuste = new AjusteDeConcorrencia({ minimo: 4, maximo: 10, inicial: 6 });
    ajuste.registrar(10 * MB, true); // 7
    ajuste.registrar(8 * MB, true); // piorou: 6, descendo
    expect(ajuste.registrar(8 * MB, true)).toBe(6);
    expect(ajuste.registrar(8 * MB, true)).toBe(6);
    expect(ajuste.registrar(8 * MB, true)).toBe(7);
  });

  it("vagas: no máximo o limite ao mesmo tempo, e o limite muda com a fila andando", async () => {
    const vagas = new Vagas(2);
    let ativos = 0;
    let pico = 0;
    const tarefa = async () => {
      await vagas.pegar();
      ativos++;
      pico = Math.max(pico, ativos);
      await new Promise((ok) => setTimeout(ok, 5));
      ativos--;
      vagas.soltar();
    };
    await Promise.all(Array.from({ length: 8 }, tarefa));
    expect(pico).toBe(2);

    pico = 0;
    const lote = Promise.all(Array.from({ length: 12 }, tarefa));
    vagas.definirLimite(5);
    await lote;
    expect(pico).toBe(5);
  });
});

describe("orçamento de memória do processamento", () => {
  it("segura quem não cabe até liberar, e deixa passar sozinho quem é maior que tudo", async () => {
    const orcamento = new Orcamento(100);
    const a = await orcamento.reservar(60);
    let entrou = false;
    const b = orcamento.reservar(60).then((liberar) => {
      entrou = true;
      return liberar;
    });
    await new Promise((ok) => setTimeout(ok, 5));
    expect(entrou).toBe(false);
    a();
    (await b)();
    expect(entrou).toBe(true);
    expect(orcamento.emUso).toBe(0);
    // Maior que o orçamento inteiro: passa quando nada mais está reservado.
    const grande = await orcamento.reservar(500);
    expect(orcamento.emUso).toBe(500);
    grande();
    grande(); // liberar duas vezes não desconta duas vezes
    expect(orcamento.emUso).toBe(0);
  });
});
