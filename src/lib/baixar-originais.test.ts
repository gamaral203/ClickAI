import { describe, expect, it } from "vitest";

import {
  baixados,
  baixarUm,
  caminhoDoItem,
  DownloadInterrompido,
  itensDosLotes,
  type FonteDeLotes,
  type ItemBaixar,
} from "./baixar-originais";

const item = (n: number, url = `https://r2/${n}?v=1`): ItemBaixar => ({
  id: `id-${String(n).padStart(3, "0")}`,
  nome: `foto_${n}.jpg`,
  url,
  bytes: 3,
  excluida: false,
});

/** Fonte falsa: 120 itens em lotes de 50; `ids` devolve URLs novas (?v=2). */
function fonteFalsa(pedidos: Parameters<FonteDeLotes>[0][] = []): FonteDeLotes {
  const todos = Array.from({ length: 120 }, (_, i) => item(i));
  return async (pedido) => {
    pedidos.push(pedido);
    if (pedido.ids) {
      return {
        ok: true,
        itens: todos
          .filter((i) => pedido.ids!.includes(i.id))
          .map((i) => ({ ...i, url: i.url.replace("v=1", "v=2") })),
        proximo: null,
        indisponiveis: [],
      };
    }
    const inicio = pedido.depois ? todos.findIndex((i) => i.id === pedido.depois) + 1 : 0;
    const itens = todos.slice(inicio, inicio + 50);
    const fim = inicio + 50 >= todos.length;
    return { ok: true, itens, proximo: fim ? null : itens.at(-1)!.id, indisponiveis: [] };
  };
}

describe("motor do download dos originais", () => {
  it("percorre os lotes pelo cursor e pula os já baixados", async () => {
    const pedidos: Parameters<FonteDeLotes>[0][] = [];
    const vistos: string[] = [];
    const sinal = new AbortController().signal;
    for await (const i of itensDosLotes(fonteFalsa(pedidos), sinal, {
      pular: new Set(["id-000"]),
    })) {
      vistos.push(i.id);
    }
    expect(vistos).toHaveLength(119);
    expect(pedidos.map((p) => p.depois ?? null)).toEqual([null, "id-049", "id-099"]);
  });

  it("URL recusada pelo R2 (403) é trocada por uma nova e o arquivo baixa", async () => {
    const urls: string[] = [];
    const buscar = (async (url: string) => {
      urls.push(url);
      return url.endsWith("v=1")
        ? new Response("vencida", { status: 403 })
        : new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;
    let bytes = 0;
    const blob = await baixarUm(
      fonteFalsa(),
      { ...item(7), obtidoEm: Date.now() },
      new AbortController().signal,
      (n) => (bytes += n),
      buscar,
    );
    expect(blob?.size).toBe(3);
    expect(bytes).toBe(3);
    expect(urls).toEqual(["https://r2/7?v=1", "https://r2/7?v=2"]);
  });

  it("URL velha é renovada antes de usar", async () => {
    const urls: string[] = [];
    const buscar = (async (url: string) => {
      urls.push(url);
      return new Response(new Uint8Array([9]));
    }) as unknown as typeof fetch;
    await baixarUm(
      fonteFalsa(),
      { ...item(3), obtidoEm: Date.now() - 20 * 60 * 1000 },
      new AbortController().signal,
      () => {},
      buscar,
    );
    expect(urls).toEqual(["https://r2/3?v=2"]);
  });

  it("falha depois de 3 tentativas vai para a lista de falhas, sem parar o resto", async () => {
    const buscar = (async (url: string) =>
      url.includes("/5?")
        ? new Response("erro", { status: 500 })
        : new Response(new Uint8Array([1]))) as unknown as typeof fetch;
    const sinal = new AbortController().signal;
    const fonte: FonteDeLotes = async () => ({
      ok: true,
      itens: [item(4), item(5), item(6)],
      proximo: null,
      indisponiveis: [],
    });
    let ultimo = { feitos: 0, falhas: [] as string[] };
    const nomes: string[] = [];
    for await (const { item: i } of baixados(
      fonte,
      itensDosLotes(fonte, sinal),
      sinal,
      (p) => (ultimo = p),
      { buscar },
    )) {
      nomes.push(i.nome);
    }
    expect(nomes).toEqual(["foto_4.jpg", "foto_6.jpg"]);
    expect(ultimo.falhas).toEqual(["id-005"]);
  }, 15_000);

  it("liberação vencida interrompe tudo", async () => {
    const fonte: FonteDeLotes = async () => ({ ok: false, motivo: "liberacao", erro: "venceu" });
    const iterar = async () => {
      for await (const _ of itensDosLotes(fonte, new AbortController().signal)) void _;
    };
    await expect(iterar()).rejects.toBeInstanceOf(DownloadInterrompido);
  });

  it("excluídas vão para a subpasta", () => {
    expect(caminhoDoItem({ nome: "a.jpg", excluida: true })).toBe("excluidas/a.jpg");
    expect(caminhoDoItem({ nome: "a.jpg", excluida: false })).toBe("a.jpg");
  });
});
