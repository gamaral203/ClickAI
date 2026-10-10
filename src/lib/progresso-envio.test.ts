import { describe, expect, it } from "vitest";

import { PESO_DO_UPLOAD, progressoDoEnvio, type ArquivoDoEnvio } from "@/lib/progresso-envio";

const MB = 1024 * 1024;

function varias(n: number, arquivo: ArquivoDoEnvio) {
  return Array.from({ length: n }, () => ({ ...arquivo }));
}

describe("progresso do envio de fotos", () => {
  it("sem arquivos fica em 0%", () => {
    expect(progressoDoEnvio([])).toEqual({
      porcentagem: 0,
      concluidas: 0,
      total: 0,
      prontas: 0,
      comErro: 0,
      repetidas: 0,
      pendentes: 0,
    });
  });

  it("antes de começar, tudo aguardando, fica em 0%", () => {
    const p = progressoDoEnvio(varias(10, { estado: "aguardando", tamanho: MB }));
    expect(p.porcentagem).toBe(0);
    expect(p.total).toBe(10);
    expect(p.concluidas).toBe(0);
  });

  it("metade subida (sem ficar pronta) conta só o peso do upload", () => {
    const p = progressoDoEnvio([
      ...varias(2, { estado: "no-servidor", tamanho: MB }),
      ...varias(2, { estado: "aguardando", tamanho: MB }),
    ]);
    expect(p.porcentagem).toBe(Math.floor(PESO_DO_UPLOAD * 50));
    expect(p.concluidas).toBe(0);
  });

  it("metade pronta fica em 50%", () => {
    const p = progressoDoEnvio([
      ...varias(16, { estado: "pronta", tamanho: MB }),
      ...varias(16, { estado: "aguardando", tamanho: MB }),
    ]);
    expect(p.porcentagem).toBe(50);
    expect(p.concluidas).toBe(16);
    expect(p.total).toBe(32);
  });

  it("usa os bytes de quem está subindo", () => {
    const p = progressoDoEnvio([{ estado: "enviando", enviados: MB / 2, tamanho: MB }]);
    expect(p.porcentagem).toBe(Math.floor(PESO_DO_UPLOAD * 50));
    // Progresso de bytes acima do tamanho (cabeçalhos) não passa do peso do upload.
    const acima = progressoDoEnvio([{ estado: "enviando", enviados: 2 * MB, tamanho: MB }]);
    expect(acima.porcentagem).toBe(Math.floor(PESO_DO_UPLOAD * 100));
  });

  it("erro conta como concluída e aparece em comErro", () => {
    const p = progressoDoEnvio([
      ...varias(30, { estado: "pronta", tamanho: MB }),
      ...varias(2, { estado: "erro", tamanho: MB }),
    ]);
    expect(p).toMatchObject({ porcentagem: 100, concluidas: 32, total: 32, prontas: 30 });
    expect(p.comErro).toBe(2);
    expect(p.pendentes).toBe(0);
  });

  it("recusadas ficam fora da conta; repetidas contam como concluídas", () => {
    const p = progressoDoEnvio([
      { estado: "recusada", tamanho: MB },
      { estado: "repetida", tamanho: MB },
      { estado: "pronta", tamanho: MB },
    ]);
    expect(p).toMatchObject({ porcentagem: 100, total: 2, concluidas: 2, repetidas: 1 });
  });

  it("arredonda para baixo e só mostra 100% quando tudo acabou", () => {
    // 199 prontas e 1 quase pronta: 99,97% vira 99%, não 100%.
    const p = progressoDoEnvio([
      ...varias(199, { estado: "pronta", tamanho: MB }),
      { estado: "no-servidor", tamanho: MB },
    ]);
    expect(p.porcentagem).toBe(99);
    expect(p.pendentes).toBe(1);
    // 1 de 3 prontas: 33,3% vira 33%.
    const terco = progressoDoEnvio([
      { estado: "pronta" },
      { estado: "aguardando" },
      { estado: "aguardando" },
    ]);
    expect(terco.porcentagem).toBe(33);
  });

  it("nunca passa de 100%", () => {
    const p = progressoDoEnvio(varias(5, { estado: "pronta", enviados: 10 * MB, tamanho: MB }));
    expect(p.porcentagem).toBe(100);
  });

  it("só recusadas: nada a enviar, 0%", () => {
    const p = progressoDoEnvio(varias(3, { estado: "recusada" }));
    expect(p).toMatchObject({ porcentagem: 0, total: 0, concluidas: 0 });
  });
});
