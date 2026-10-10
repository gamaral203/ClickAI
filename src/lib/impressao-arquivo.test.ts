import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { impressaoDoArquivo, impressaoDoBlob, trechosDaImpressao } from "@/lib/impressao-arquivo";

const MB = 1024 * 1024;

function aleatorio(tamanho: number, semente: number) {
  const b = Buffer.alloc(tamanho);
  let x = semente;
  for (let i = 0; i < tamanho; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    b[i] = x >>> 24;
  }
  return b;
}

const doBuffer = (b: Buffer) => impressaoDoArquivo(b.length, (a, c) => b.subarray(a, c));

describe("impressão do arquivo (detecção de repetidas)", () => {
  it("arquivo de até 3 MB entra inteiro; maior, só o início, o meio e o fim", () => {
    expect(trechosDaImpressao(2 * MB)).toEqual([[0, 2 * MB]]);
    expect(trechosDaImpressao(40 * MB)).toEqual([
      [0, MB],
      [19.5 * MB, 20.5 * MB],
      [39 * MB, 40 * MB],
    ]);
  });

  it("é igual no navegador (Blob) e no servidor (Buffer), e lê só ~3 MB", async () => {
    const arquivo = aleatorio(25 * MB, 7);
    let lidos = 0;
    const servidor = await impressaoDoArquivo(arquivo.length, (a, c) => {
      lidos += c - a;
      return arquivo.subarray(a, c);
    });
    expect(lidos).toBe(3 * MB);
    expect(servidor).toMatch(/^[0-9a-f]{64}$/);
    expect(await impressaoDoBlob(new Blob([arquivo]))).toBe(servidor);
    // Não é o SHA-256 do arquivo inteiro.
    expect(servidor).not.toBe(createHash("sha256").update(arquivo).digest("hex"));
  });

  it("muda com o tamanho e com qualquer byte dos trechos lidos", async () => {
    const arquivo = aleatorio(10 * MB, 11);
    const original = await doBuffer(arquivo);
    for (const posicao of [10, 5 * MB, 10 * MB - 10]) {
      const mudado = Buffer.from(arquivo);
      mudado[posicao] ^= 1;
      expect(await doBuffer(mudado)).not.toBe(original);
    }
    expect(await doBuffer(arquivo.subarray(0, arquivo.length - 1))).not.toBe(original);
    // Documentado: um byte fora dos trechos (entre o início e o meio) não muda a impressão.
    const fora = Buffer.from(arquivo);
    fora[2 * MB] ^= 1;
    expect(await doBuffer(fora)).toBe(original);
  });

  it("fotos diferentes do mesmo tamanho têm impressões diferentes", async () => {
    expect(await doBuffer(aleatorio(8 * MB, 1))).not.toBe(await doBuffer(aleatorio(8 * MB, 2)));
  });
});
