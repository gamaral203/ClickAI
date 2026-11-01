import { describe, expect, it, vi } from "vitest";

import { emParalelo } from "./concorrencia";
import {
  avisoDeParada,
  CircuitoDeLeitura,
  comNovasTentativas,
  comTempoLimite,
  FALHAS_SEGUIDAS_PARA_PARAR,
  leituraEstaLenta,
  LeituraInterrompida,
  lerComProtecao,
  OperacaoCancelada,
  TempoEsgotado,
} from "./leitura-arquivo";

const nunca = () => new Promise<never>(() => {});

describe("comTempoLimite", () => {
  it("rejeita quando a leitura nunca termina", async () => {
    await expect(comTempoLimite(nunca, 5)).rejects.toBeInstanceOf(TempoEsgotado);
  });

  it("devolve o valor e repassa o erro da leitura", async () => {
    await expect(comTempoLimite(async () => 7, 1000)).resolves.toBe(7);
    const erro = new DOMException("x", "NotReadableError");
    await expect(
      comTempoLimite(async () => {
        throw erro;
      }, 1000),
    ).rejects.toBe(erro);
  });

  it("transforma erro síncrono em rejeição", async () => {
    await expect(
      comTempoLimite(() => {
        throw new Error("síncrono");
      }, 1000),
    ).rejects.toThrow("síncrono");
  });

  it("cancelar encerra a espera na hora, sem esperar o tempo-limite", async () => {
    const controle = new AbortController();
    const espera = comTempoLimite(nunca, 60_000, controle.signal);
    controle.abort();
    await expect(espera).rejects.toBeInstanceOf(OperacaoCancelada);
    await expect(comTempoLimite(async () => 1, 1000, controle.signal)).rejects.toBeInstanceOf(
      OperacaoCancelada,
    );
  });
});

describe("lerComProtecao", () => {
  it("depois de várias falhas seguidas, o resto nem tenta ler", async () => {
    const circuito = new CircuitoDeLeitura();
    const ler = vi.fn(nunca);
    const leituras = Array.from({ length: FALHAS_SEGUIDAS_PARA_PARAR }, () =>
      lerComProtecao(ler, { limiteMs: 2, circuito }).catch((e) => e),
    );
    for (const erro of await Promise.all(leituras)) expect(erro).toBeInstanceOf(TempoEsgotado);
    expect(circuito.aberto).toBe(true);

    ler.mockClear();
    await expect(lerComProtecao(ler, { limiteMs: 2, circuito })).rejects.toBeInstanceOf(
      LeituraInterrompida,
    );
    expect(ler).not.toHaveBeenCalled();
  });

  it("um sucesso zera a contagem: arquivos ruins soltos não param a leitura", async () => {
    const circuito = new CircuitoDeLeitura(2);
    const falha = async () => {
      throw new DOMException("x", "NotReadableError");
    };
    await lerComProtecao(falha, { limiteMs: 100, circuito }).catch(() => {});
    await lerComProtecao(async () => 1, { limiteMs: 100, circuito });
    await lerComProtecao(falha, { limiteMs: 100, circuito }).catch(() => {});
    expect(circuito.aberto).toBe(false);
  });

  it("cancelar não conta como falha", async () => {
    const circuito = new CircuitoDeLeitura(1);
    const controle = new AbortController();
    const espera = lerComProtecao(nunca, { limiteMs: 1000, circuito, sinal: controle.signal });
    controle.abort();
    await expect(espera).rejects.toBeInstanceOf(OperacaoCancelada);
    expect(circuito.aberto).toBe(false);
  });

  it("arquivo ilegível ou preso não para a fila e o progresso chega ao total", async () => {
    const circuito = new CircuitoDeLeitura();
    const progresso: number[] = [];
    let feitas = 0;
    const lidos = await emParalelo([0, 1, 2, 3, 4, 5], 2, async (n) => {
      try {
        return await lerComProtecao(
          async () => {
            if (n === 1) return nunca();
            if (n === 3) throw new DOMException("x", "NotReadableError");
            return `ok${n}`;
          },
          { limiteMs: 5, circuito },
        );
      } catch {
        return "ilegivel";
      } finally {
        progresso.push(++feitas);
      }
    });
    expect(lidos.map((r) => r.ok && r.valor)).toEqual([
      "ok0",
      "ilegivel",
      "ok2",
      "ilegivel",
      "ok4",
      "ok5",
    ]);
    expect(progresso).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("comNovasTentativas", () => {
  const opcoes = {
    repetir: (status: number) => status === 0 || status >= 500,
    esperaMs: () => 0,
    dormir: async () => {},
  };

  it("repete falha de rede até dar certo", async () => {
    const respostas = [0, 503, 200];
    const fazer = vi.fn(async () => respostas.shift()!);
    await expect(comNovasTentativas(fazer, { ...opcoes, tentativas: 4 })).resolves.toBe(200);
    expect(fazer).toHaveBeenCalledTimes(3);
  });

  it("não repete recusa definitiva e respeita o total de tentativas", async () => {
    const recusa = vi.fn(async () => 403);
    await expect(comNovasTentativas(recusa, { ...opcoes, tentativas: 4 })).resolves.toBe(403);
    expect(recusa).toHaveBeenCalledTimes(1);

    const queda = vi.fn(async () => 0);
    await expect(comNovasTentativas(queda, { ...opcoes, tentativas: 3 })).resolves.toBe(0);
    expect(queda).toHaveBeenCalledTimes(3);
  });

  it("para de tentar depois de cancelar", async () => {
    const controle = new AbortController();
    const fazer = vi.fn(async () => {
      controle.abort();
      return 0;
    });
    await comNovasTentativas(fazer, { ...opcoes, tentativas: 4, sinal: controle.signal });
    expect(fazer).toHaveBeenCalledTimes(1);
  });
});

describe("avisos", () => {
  it("só avisa depois do tempo sem avanço de cada fase", () => {
    expect(avisoDeParada("conferencia", 19)).toBeNull();
    expect(avisoDeParada("conferencia", 20)).toContain("copie as fotos para o computador");
    expect(avisoDeParada("envio", 59)).toBeNull();
    expect(avisoDeParada("envio", 60)).toContain("60 segundos");
  });

  it("recomenda copiar só com amostras suficientes e média lenta", () => {
    expect(leituraEstaLenta(3, 30_000)).toBe(false);
    expect(leituraEstaLenta(10, 5000)).toBe(false);
    expect(leituraEstaLenta(10, 30_000)).toBe(true);
  });
});
